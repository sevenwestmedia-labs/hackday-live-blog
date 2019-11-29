import * as aws from '@pulumi/aws'

export interface Post {
  id: string
  post: number
  content: any
}
export async function getPosts(
  table: string,
  id: string,
  fromPost?: number,
  take: number = 25
): Promise<{
  items: Array<Post>
  nextPost?: number
}> {
  const client = new aws.sdk.DynamoDB.DocumentClient()

  const result = await client
    .query({
      TableName: table,
      KeyConditionExpression: fromPost
        ? 'Id = :hkey and Post <= :rkey'
        : 'Id = :hkey',
      ExpressionAttributeValues: fromPost
        ? {
            ':hkey': id,
            ':rkey': fromPost
          }
        : {
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
      items: result.Items.map<Post>(item => ({
        id: item.Id,
        post: item.Post,
        content: JSON.parse(item.Content)
      })),
      nextPost: next.Items
        ? next.Items[0]
          ? next.Items[0].Post
          : undefined
        : undefined
    }
  }

  return {
    items: result.Items.map<Post>(item => ({
      id: item.Id,
      post: item.Post,
      content: JSON.parse(item.Content)
    }))
  }
}
