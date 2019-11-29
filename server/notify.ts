import * as aws from '@pulumi/aws'

export async function notifyClients(connectionsTable: string, post: any) {
  const client = new aws.sdk.DynamoDB.DocumentClient()

  const connectionData = await client
    .scan({
      ProjectionExpression: 'ConnectionId',
      TableName: connectionsTable
    })
    .promise()

  const apiGatewayManagement = new aws.sdk.ApiGatewayManagementApi({
    endpoint: '0un6utp9lb.execute-api.ap-southeast-2.amazonaws.com/stage'
  })
  const postCalls = connectionData.Items!.map(async ({ ConnectionId }) => {
    try {
      await apiGatewayManagement
        .postToConnection({ ConnectionId, Data: JSON.stringify(post) })
        .promise()
    } catch (e) {
      if (e.statusCode === 410) {
        console.log(`Found stale connection, deleting ${ConnectionId}`)
        await client
          .delete({
            TableName: connectionsTable,
            Key: { ConnectionId }
          })
          .promise()
      } else {
        throw e
      }
    }
  })

  await Promise.all(postCalls)
}
