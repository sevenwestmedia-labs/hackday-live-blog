import * as aws from '@pulumi/aws'
import * as awsx from '@pulumi/awsx'
import { Post } from './posts'
import { getPosts } from './posts'

const table = new aws.dynamodb.Table('live-blog-table', {
  attributes: [
    {
      name: 'Id',
      type: 'S'
    },
    {
      name: 'Post',
      type: 'N'
    }
  ],

  billingMode: 'PAY_PER_REQUEST',
  hashKey: 'Id',
  rangeKey: 'Post',
  readCapacity: 5,
  writeCapacity: 5
})

const api = new awsx.apigateway.API('live-blog', {
  routes: [
    {
      path: '/posts/{id}',
      method: 'GET',
      eventHandler: async event => {
        const id = event.pathParameters!['id']

        const posts = await getPosts(table.name.get(), id)
        return {
          statusCode: 200,
          body: JSON.stringify(posts)
        }
      }
    },
    {
      path: '/posts/{id}/before/{post}',
      method: 'GET',
      eventHandler: async event => {
        const id = event.pathParameters!['id']
        const post = event.pathParameters!['post']

        const posts = await getPosts(table.name.get(), id, Number(post))
        return {
          statusCode: 200,
          body: JSON.stringify(posts)
        }
      }
    },
    {
      path: '/posts/{id}',
      method: 'POST',
      eventHandler: async event => {
        const id = event.pathParameters!['id']
        const client = new aws.sdk.DynamoDB.DocumentClient()
        const connectionData = await client
          .scan({
            ProjectionExpression: 'ConnectionId',
            TableName: connections.name.get()
          })
          .promise()

        const apiGatewayManagement = new aws.sdk.ApiGatewayManagementApi({
          endpoint:
            'rv08ei0mn0.execute-api.ap-southeast-2.amazonaws.com/stage/@connections'
        })

        const currentPostId = await client
          .query({
            TableName: table.name.get(),
            KeyConditionExpression: 'Id = :id',
            ExpressionAttributeValues: {
              ':id': id
            },
            Limit: 1,
            ScanIndexForward: false,
            ConsistentRead: true
          })
          .promise()
        const postData = JSON.parse(event.body!)

        const NewItem = {
          Id: id,
          Post:
            currentPostId.Items && currentPostId.Items[0]
              ? Number(currentPostId.Items![0].Post) + 1
              : 1,
          Content: JSON.stringify(postData)
        }
        await client
          .put({
            TableName: table.name.get(),
            Item: NewItem
          })
          .promise()

        const post: Post = {
          id: NewItem.Id,
          post: NewItem.Post,
          content: postData
        }
        const postCalls = connectionData.Items!.map(
          async ({ ConnectionId }) => {
            try {
              await apiGatewayManagement
                .postToConnection({ ConnectionId, Data: JSON.stringify(post) })
                .promise()
            } catch (e) {
              if (e.statusCode === 410) {
                console.log(`Found stale connection, deleting ${ConnectionId}`)
                await client
                  .delete({
                    TableName: connections.name.get(),
                    Key: { ConnectionId }
                  })
                  .promise()
              } else {
                throw e
              }
            }
          }
        )

        try {
          await Promise.all(postCalls)
        } catch (e) {
          return { statusCode: 500, body: e.stack }
        }

        return { statusCode: 200, body: 'Posted' }
      }
    }
  ]
})

const connections = new aws.dynamodb.Table('live-blog-connections', {
  attributes: [
    {
      name: 'ConnectionId',
      type: 'S'
    }
  ],

  billingMode: 'PAY_PER_REQUEST',
  hashKey: 'ConnectionId',
  readCapacity: 5,
  writeCapacity: 5
})

const lamdaRole = new aws.iam.Role('live-blog-ws-role', {
  assumeRolePolicy: {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: '',
        Effect: 'Allow',
        Principal: {
          Service: ['lambda.amazonaws.com', 'apigateway.amazonaws.com']
        },
        Action: 'sts:AssumeRole'
      }
    ]
  }
})
new aws.iam.RolePolicyAttachment(`live-blog-ws-role-lambda-policy`, {
  role: lamdaRole,
  policyArn: aws.iam.AWSLambdaFullAccess
})

const onConnect = new aws.lambda.CallbackFunction('on-connect', {
  role: lamdaRole,
  callback: async (event: { requestContext: { connectionId: string } }) => {
    const client = new aws.sdk.DynamoDB.DocumentClient()

    const { $response } = await client
      .put({
        Item: { ConnectionId: event.requestContext.connectionId },
        TableName: connections.name.get()
      })
      .promise()

    return {
      statusCode: $response.error ? 500 : 200,
      body: $response.error
        ? 'Failed to connect: ' + JSON.stringify($response.error)
        : 'Connected.'
    }
  }
})

const onDisconnect = new aws.lambda.CallbackFunction('on-disconnect', {
  role: lamdaRole,
  callback: async (event: { requestContext: { connectionId: string } }) => {
    const client = new aws.sdk.DynamoDB.DocumentClient()

    const { $response } = await client
      .delete({
        Key: {
          ConnectionId: event.requestContext.connectionId
        },
        TableName: connections.name.get()
      })
      .promise()

    return {
      statusCode: $response.error ? 500 : 200,
      body: $response.error
        ? 'Failed to connect: ' + JSON.stringify($response.error)
        : 'Connected.'
    }
  }
})

export const onConnectInvokeArn = onConnect.invokeArn
export const onConnectRole = onConnect.role
export const onDisconnectInvokeArn = onDisconnect.invokeArn
export const onDisconnectRole = onDisconnect.role

export const endpoint = api.url
