import { Injectable, OnModuleInit, Logger, BadRequestException } from '@nestjs/common';
import * as faceapi from '@vladmandic/face-api';
import * as tf from '@tensorflow/tfjs-node';
import * as canvas from 'canvas';
import * as path from 'path';

// Monkey-patch face-api to use node-canvas
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData } as any);

@Injectable()
export class FaceRecognitionService implements OnModuleInit {
    private readonly logger = new Logger(FaceRecognitionService.name);
    private modelsLoaded = false;

    async onModuleInit(): Promise<void> {
        // Kept enabled: face enrollment (extractDescriptor) is still used by
        // employee/user creation, so the models must load even though the
        // Attendance UI is hidden.
        await this.loadModels();
    }

    private async loadModels(): Promise<void> {
        try {
            const modelsPath = path.resolve(__dirname, '..', 'face-models');
            this.logger.log(`Loading face-api models from ${modelsPath}`);

            await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsPath);
            await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath);
            await faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath);

            this.modelsLoaded = true;
            this.logger.log('Face-api models loaded successfully');
        } catch (error) {
            this.logger.error('Failed to load face-api models', error);
        }
    }

    private ensureModelsLoaded(): void {
        if (!this.modelsLoaded) {
            throw new BadRequestException('Face recognition models are not loaded. Please try again later.');
        }
    }

    // Minimum face-detection score (0..1) we accept. Below this, the captured
    // image is too low-quality (poor lighting / partial face / motion blur)
    // and the resulting descriptor is unreliable. Rejecting low-quality
    // captures is the single biggest false-positive defence.
    private readonly MIN_DETECTION_SCORE = 0.7;

    /**
     * Extract a 128-float face descriptor from a base64 image.
     * Throws if no face / multiple faces / detection quality is too low.
     */
    async extractDescriptor(base64Image: string): Promise<Float32Array> {
        this.ensureModelsLoaded();

        // Strip data URI prefix if present
        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        const img = await canvas.loadImage(buffer);
        const canvasEl = canvas.createCanvas(img.width, img.height);
        const ctx = canvasEl.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const detections = await faceapi
            .detectAllFaces(canvasEl as any)
            .withFaceLandmarks()
            .withFaceDescriptors();

        if (detections.length === 0) {
            throw new BadRequestException('No face detected in the image. Please ensure your face is clearly visible.');
        }

        if (detections.length > 1) {
            throw new BadRequestException('Multiple faces detected. Please ensure only one face is visible in the image.');
        }

        const detection = detections[0];
        // detection.detection.score is the SSD confidence (0..1).
        // Low quality captures (blurry, partial face, bad lighting) yield
        // unreliable descriptors that match anyone — reject them upfront.
        const score = (detection as any)?.detection?.score ?? 0;
        if (score < this.MIN_DETECTION_SCORE) {
            this.logger.debug(`Face detection quality too low: ${score.toFixed(3)} < ${this.MIN_DETECTION_SCORE}`);
            throw new BadRequestException(
                'Face quality is too low. Please look directly at the camera in good lighting and try again.',
            );
        }

        return detection.descriptor;
    }

    /**
     * Compute Euclidean distance between two face descriptors.
     */
    compareDescriptors(a: Float32Array | number[], b: Float32Array | number[]): number {
        const arrA = Array.from(a);
        const arrB = Array.from(b);

        if (arrA.length !== arrB.length) {
            throw new BadRequestException('Face descriptor dimensions do not match.');
        }

        let sum = 0;
        for (let i = 0; i < arrA.length; i++) {
            const diff = arrA[i] - arrB[i];
            sum += diff * diff;
        }
        return Math.sqrt(sum);
    }

    /**
     * Check if two face descriptors match within the given threshold.
     * Lower distance = more similar. Default threshold: 0.5 (strict).
     */
    isMatch(
        stored: Float32Array | number[],
        captured: Float32Array | number[],
        threshold = 0.5,
    ): boolean {
        const distance = this.compareDescriptors(stored, captured);
        this.logger.debug(`Face match distance: ${distance.toFixed(4)}, threshold: ${threshold}`);
        return distance < threshold;
    }

    // Minimum gap between best and second-best distance for a confident match.
    // If best=0.45 and second-best=0.49, the gap is 0.04 — too close, both are
    // "kind of similar" to the captured face → ambiguous → reject.
    // A real match has best clearly lower than runners-up (e.g. best=0.32, second=0.55).
    private readonly MATCH_MARGIN = 0.08;

    /**
     * Kiosk flow: extract a descriptor from a base64 image and find the best
     * match against a list of enrolled employees.
     *
     * Returns:
     *   { matched: true, user_id, distance, runnerUpDistance }     - confident match
     *   { matched: false, reason: 'no_match' }                     - no one below threshold
     *   { matched: false, reason: 'low_confidence', best, second } - ambiguous (best vs second too close)
     *
     * Two-stage filter:
     *   1) best.distance must be below `threshold` (default 0.5) → "is it close enough"
     *   2) best must be at least MATCH_MARGIN better than second-best → "is it unambiguous"
     *
     * Stage 2 is the key defence against "non-registered face" false positives:
     * a stranger's noisy descriptor is roughly equidistant from everyone, so
     * the margin is always small. Real employees have a clear winner.
     */
    async identifyFromImage(
        base64Image: string,
        roster: Array<{ user_id: string; descriptor: number[] }>,
        threshold = 0.5,
    ): Promise<
        | { matched: true; user_id: string; distance: number; runnerUpDistance: number | null }
        | { matched: false; reason: 'no_roster' | 'no_match' | 'low_confidence'; best?: number; second?: number }
    > {
        if (!roster || roster.length === 0) {
            return { matched: false, reason: 'no_roster' };
        }

        const captured = await this.extractDescriptor(base64Image);

        // Compute all distances so we can pick best AND second-best
        const distances: Array<{ user_id: string; distance: number }> = [];
        for (const entry of roster) {
            if (!entry.descriptor || !Array.isArray(entry.descriptor)) continue;
            distances.push({
                user_id: entry.user_id,
                distance: this.compareDescriptors(entry.descriptor, captured),
            });
        }

        if (distances.length === 0) {
            return { matched: false, reason: 'no_roster' };
        }

        // Sort ascending — closest first
        distances.sort((a, b) => a.distance - b.distance);

        const best = distances[0];
        const second = distances[1] || null;

        // Diagnostic: log top-3 so production logs can be tuned
        const top3 = distances.slice(0, 3)
            .map(d => `${d.user_id.slice(0, 8)}=${d.distance.toFixed(3)}`)
            .join(', ');
        this.logger.log(`Face identify | threshold=${threshold} margin=${this.MATCH_MARGIN} | top3: ${top3}`);

        // Stage 1: best must be below threshold
        if (best.distance >= threshold) {
            return { matched: false, reason: 'no_match', best: best.distance, second: second?.distance };
        }

        // Stage 2: best must be meaningfully better than second-best
        // (skipped if there's only one enrolled employee — no runner-up to compare)
        if (second !== null) {
            const margin = second.distance - best.distance;
            if (margin < this.MATCH_MARGIN) {
                this.logger.warn(
                    `Face match REJECTED (low confidence): best=${best.distance.toFixed(3)} second=${second.distance.toFixed(3)} margin=${margin.toFixed(3)} < ${this.MATCH_MARGIN}`,
                );
                return {
                    matched: false,
                    reason: 'low_confidence',
                    best: best.distance,
                    second: second.distance,
                };
            }
        }

        this.logger.log(
            `Face matched user ${best.user_id} with distance ${best.distance.toFixed(4)} (margin OK)`,
        );
        return {
            matched: true,
            user_id: best.user_id,
            distance: best.distance,
            runnerUpDistance: second?.distance ?? null,
        };
    }
}
