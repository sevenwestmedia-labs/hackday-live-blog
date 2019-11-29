import * as aws from '@pulumi/aws'

export async function getCurrentPostId(table: string, id: string) {
  const client = new aws.sdk.DynamoDB.DocumentClient()

  return await client
    .query({
      TableName: table,
      KeyConditionExpression: 'Id = :id',
      ExpressionAttributeValues: {
        ':id': id
      },
      Limit: 1,
      ScanIndexForward: false,
      ConsistentRead: true
    })
    .promise()
}
