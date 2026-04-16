import { AssessmentEntity } from '@modules/assessment/repository/entities/assessment.entity';

export interface IAssessmentEntity extends Omit<AssessmentEntity, '_id'> {
    _id: string;
}

export interface IRequestAssessmentApp {
    __assessment: IAssessmentEntity;
}