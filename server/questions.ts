import * as aws from '@pulumi/aws'

export interface Question {
    id: string
    questionId: string
    content: string
}

// TODO Needs paging etc
export async function getQuestions(
    table: string,
    id: string,
    take: number = 25
): Promise<{
    items: Array<Question>
    nextPost?: number
}> {
    const client = new aws.sdk.DynamoDB.DocumentClient()

    const result = await client
        .query({
            TableName: table,
            KeyConditionExpression: 'Id = :hkey',
            ExpressionAttributeValues: {
                ':hkey': id
            },
            Limit: take,
            ScanIndexForward: false,
            ConsistentRead: true
        })
        .promise()

    if (!result.Items) {
        return { items: [] }
    }

    if (result.LastEvaluatedKey) {
        const next = await client
            .query({
                TableName: table,
                KeyConditionExpression: 'Id = :hkey',
                ExpressionAttributeValues: {
                    ':hkey': id
                },
                Limit: 1,
                ScanIndexForward: false,
                ExclusiveStartKey: result.LastEvaluatedKey,
                ConsistentRead: true
            })
            .promise()

        return {
            items: result.Items.map<Question>(item => ({
                id: item.Id,
                questionId: item.QuestionId,
                content: JSON.parse(item.Content)
            })),
            nextPost: next.Items ? (next.Items[0] ? next.Items[0].Post : undefined) : undefined
        }
    }

    return {
        items: result.Items.map<Question>(item => ({
            id: item.Id,
            questionId: item.QuestionId,
            content: JSON.parse(item.Content)
        }))
    }
}
