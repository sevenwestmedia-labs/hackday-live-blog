import * as aws from '@pulumi/aws'
import * as awsx from '@pulumi/awsx'
import { Post } from './posts'
import { getPosts } from './posts'
import { APIGatewayProxyEvent } from 'aws-lambda'
import { Policy } from '@pulumi/aws/iam'
import { getCurrentPostId } from './getCurrentPostId'
import { notifyClients } from './notify'

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

const postRole = new aws.iam.Role('live-blog-create-post-role', {
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
new aws.iam.RolePolicyAttachment(`live-blog-create-post-role-policy`, {
  role: postRole,
  policyArn: aws.iam.AWSLambdaFullAccess
})
new aws.iam.RolePolicyAttachment(`live-blog-create-post-role-policy-attach`, {
  role: postRole,
  policyArn: new Policy('live-blog-create-post-role-policy-manage-api', {
    policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['execute-api:Invoke', 'execute-api:ManageConnections'],
          Resource: 'arn:aws:execute-api:*:*:*'
        }
      ]
    }
  }).arn
})
const createPostLambda = new aws.lambda.CallbackFunction(
  'live-blog-create-post',
  {
    role: postRole,
    callback: async (event: APIGatewayProxyEvent) => {
      const id = event.pathParameters!['id']
      const client = new aws.sdk.DynamoDB.DocumentClient()

      const currentPostId = await getCurrentPostId(table.name.get(), id)
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

      try {
        await notifyClients(connections.name.get(), post)
      } catch (e) {
        return { statusCode: 500, body: e.stack }
      }

      return { statusCode: 201, body: 'Created' }
    }
  }
)

const updatePostLambda = new aws.lambda.CallbackFunction(
  'live-blog-update-post',
  {
    role: postRole,
    callback: async (event: APIGatewayProxyEvent) => {
      const id = event.pathParameters!['id']
      const postNumber = Number(event.pathParameters!['post'])
      const client = new aws.sdk.DynamoDB.DocumentClient()
      const postData = JSON.parse(event.body!)

      const NewItem = {
        Id: id,
        Post: postNumber,
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

      try {
        await notifyClients(connections.name.get(), post)
      } catch (e) {
        return { statusCode: 500, body: e.stack }
      }

      return { statusCode: 200, body: 'Updated' }
    }
  }
)
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
          headers: {
            'Access-Control-Allow-Origin': '*'
          },
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

      eventHandler: createPostLambda
    },
    {
      path: '/posts/{id}/{post}',
      method: 'PUT',

      eventHandler: updatePostLambda
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
