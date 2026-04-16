// /**
//  * Widget collection compound indexes for optimal query performance
//  * These should be created manually in MongoDB or through migration scripts
//  */

// export const WIDGET_COMPOUND_INDEXES = [
//     // Compound index for user widget queries (most common)
//     {
//         name: 'user_widgets_query',
//         fields: { user_id: 1, soft_delete: 1, order: 1 },
//         options: { background: true }
//     },
    
//     // Compound index for user + tool widget queries
//     {
//         name: 'user_tool_widgets_query', 
//         fields: { user_id: 1, tool_slug: 1, soft_delete: 1 },
//         options: { background: true }
//     },
    
//     // Compound index for widget existence checks
//     {
//         name: 'widget_existence_check',
//         fields: { user_id: 1, slug: 1 },
//         options: { background: true, unique: true }
//     },
    
//     // Index for tool-based operations
//     {
//         name: 'tool_operations',
//         fields: { tool_slug: 1, soft_delete: 1 },
//         options: { background: true }
//     }
// ];

// /**
//  * MongoDB index creation commands (for reference)
//  * 
//  * db.widgets.createIndex({ "user_id": 1, "soft_delete": 1, "order": 1 }, { "background": true, "name": "user_widgets_query" })
//  * db.widgets.createIndex({ "user_id": 1, "tool_slug": 1, "soft_delete": 1 }, { "background": true, "name": "user_tool_widgets_query" })
//  * db.widgets.createIndex({ "user_id": 1, "slug": 1 }, { "background": true, "unique": true, "name": "widget_existence_check" })
//  * db.widgets.createIndex({ "tool_slug": 1, "soft_delete": 1 }, { "background": true, "name": "tool_operations" })
//  */