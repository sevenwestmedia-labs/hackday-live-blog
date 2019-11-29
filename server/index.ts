import * as aws from '@pulumi/aws'
import * as awsx from '@pulumi/awsx'
import * as cuid from 'cuid'
import { Post } from './posts'
import { getPosts } from './posts'
import { getQuestions, Question } from './questions'
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

const questions = new aws.dynamodb.Table('live-blog-questions', {
    attributes: [
        {
            name: 'Id',
            type: 'S'
        },
        {
            name: 'QuestionId',
            type: 'S'
        }
    ],

    billingMode: 'PAY_PER_REQUEST',
    hashKey: 'Id',
    rangeKey: 'QuestionId',
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
const createPostLambda = new aws.lambda.CallbackFunction('live-blog-create-post', {
    role: postRole,
    callback: async (event: APIGatewayProxyEvent) => {
        const id = event.pathParameters!['id']
        const client = new aws.sdk.DynamoDB.DocumentClient()

        const currentPostId = await getCurrentPostId(table.name.get(), id)

        const postData = JSON.parse(
            event.isBase64Encoded ? Buffer.from(event.body!, 'base64').toString('ascii') : event.body!
        )

        const postNumber = currentPostId.Items && currentPostId.Items[0] ? Number(currentPostId.Items![0].Post) + 1 : 1
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
            await notifyClients(
                connections.name.get(),
                '0un6utp9lb.execute-api.ap-southeast-2.amazonaws.com/stage',
                post
            )
        } catch (e) {
            return { statusCode: 500, body: e.stack }
        }

        return {
            statusCode: 201,
            body: JSON.stringify({ postId: postNumber }),
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        }
    }
})

const updatePostLambda = new aws.lambda.CallbackFunction('live-blog-update-post', {
    role: postRole,
    callback: async (event: APIGatewayProxyEvent) => {
        const id = event.pathParameters!['id']
        const postNumber = Number(event.pathParameters!['post'])
        const client = new aws.sdk.DynamoDB.DocumentClient()
        const postData = JSON.parse(
            event.isBase64Encoded ? Buffer.from(event.body!, 'base64').toString('ascii') : event.body!
        )

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
            await notifyClients(
                connections.name.get(),
                '0un6utp9lb.execute-api.ap-southeast-2.amazonaws.com/stage',
                post
            )
        } catch (e) {
            return { statusCode: 500, body: e.stack }
        }

        return {
            statusCode: 200,
            body: 'Updated',
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        }
    }
})

const createQuestionLambda = new aws.lambda.CallbackFunction('live-blog-create-question', {
    role: postRole,
    callback: async (event: APIGatewayProxyEvent) => {
        const id = event.pathParameters!['id']
        const client = new aws.sdk.DynamoDB.DocumentClient()
        const postData = event.isBase64Encoded ? Buffer.from(event.body!, 'base64').toString('ascii') : event.body!

        const NewItem = {
            Id: id,
            QuestionId: cuid(),
            Content: postData
        }
        await client
            .put({
                TableName: questions.name.get(),
                Item: NewItem
            })
            .promise()

        const question: Question = {
            id: NewItem.Id,
            questionId: NewItem.QuestionId,
            content: postData
        }

        try {
            await notifyClients(
                questionConnections.name.get(),
                'senpaqk2re.execute-api.ap-southeast-2.amazonaws.com/stage',
                question
            )
        } catch (e) {
            return { statusCode: 500, body: e.stack }
        }

        return {
            statusCode: 201,
            body: JSON.stringify({ questionId: NewItem.QuestionId }),
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        }
    }
})
const deleteQuestionLambda = new aws.lambda.CallbackFunction('live-blog-delete-question', {
    role: postRole,
    callback: async (event: APIGatewayProxyEvent) => {
        const id = event.pathParameters!['id']
        const questionId = event.pathParameters!['questionId']
        const client = new aws.sdk.DynamoDB.DocumentClient()

        await client
            .delete({
                TableName: questions.name.get(),
                Key: {
                    Id: id,
                    QuestionId: questionId
                }
            })
            .promise()

        try {
            await notifyClients(
                questionConnections.name.get(),
                'senpaqk2re.execute-api.ap-southeast-2.amazonaws.com/stage',
                { deleted: true, questionId }
            )
        } catch (e) {
            return { statusCode: 500, body: e.stack }
        }

        return {
            statusCode: 201,
            body: JSON.stringify({}),
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        }
    }
})

const optionsResponse = new aws.lambda.CallbackFunction('live-blog-option-responder', {
    callback: async () => {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
            },
            body: ''
        }
    }
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
                    headers: {
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify(posts)
                }
            }
        },
        {
            path: '/posts/{id}/questions',
            method: 'GET',
            eventHandler: async event => {
                const id = event.pathParameters!['id']

                const posts = await getQuestions(questions.name.get(), id)
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
            method: 'OPTIONS',
            eventHandler: optionsResponse
        },
        {
            path: '/posts/{id}',
            method: 'POST',

            eventHandler: createPostLambda
        },
        {
            path: '/posts/{id}/questions',
            method: 'OPTIONS',
            eventHandler: optionsResponse
        },
        {
            path: '/posts/{id}/questions',
            method: 'POST',

            eventHandler: createQuestionLambda
        },
        {
            path: '/posts/{id}/questions/{questionId}',
            method: 'OPTIONS',
            eventHandler: optionsResponse
        },
        {
            path: '/posts/{id}/questions/{questionId}',
            method: 'DELETE',
            eventHandler: deleteQuestionLambda
        },
        {
            path: '/posts/{id}/{post}',
            method: 'OPTIONS',
            eventHandler: optionsResponse
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
const questionConnections = new aws.dynamodb.Table('live-blog-questions-connections', {
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
            body: $response.error ? 'Failed to connect: ' + JSON.stringify($response.error) : 'Connected.'
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
            body: $response.error ? 'Failed to connect: ' + JSON.stringify($response.error) : 'Connected.'
        }
    }
})

const onQuestionConnect = new aws.lambda.CallbackFunction('live-blog-connect-questions', {
    role: lamdaRole,
    callback: async (event: { requestContext: { connectionId: string } }) => {
        const client = new aws.sdk.DynamoDB.DocumentClient()

        const { $response } = await client
            .put({
                Item: { ConnectionId: event.requestContext.connectionId },
                TableName: questionConnections.name.get()
            })
            .promise()

        return {
            statusCode: $response.error ? 500 : 200,
            body: $response.error ? 'Failed to connect: ' + JSON.stringify($response.error) : 'Connected.'
        }
    }
})

const onQuestionDisconnect = new aws.lambda.CallbackFunction('live-blog-disconnect-questions', {
    role: lamdaRole,
    callback: async (event: { requestContext: { connectionId: string } }) => {
        const client = new aws.sdk.DynamoDB.DocumentClient()

        const { $response } = await client
            .delete({
                Key: {
                    ConnectionId: event.requestContext.connectionId
                },
                TableName: questionConnections.name.get()
            })
            .promise()

        return {
            statusCode: $response.error ? 500 : 200,
            body: $response.error ? 'Failed to connect: ' + JSON.stringify($response.error) : 'Connected.'
        }
    }
})

export const wsRoles = lamdaRole.arn

export const onConnectInvokeArn = onConnect.invokeArn
export const onDisconnectInvokeArn = onDisconnect.invokeArn
export const onQuestionConnectInvokeArn = onQuestionConnect.invokeArn
export const onQuestionDisconnectInvokeArn = onQuestionDisconnect.invokeArn

export const endpoint = api.url
