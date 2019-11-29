import React from 'react'
import { restUri } from './App'
import useWebSocket from 'react-use-websocket'

export const QuestionList = ({ blogId, createPost }) => {
    const [loading, setLoading] = React.useState(true)
    const [questions, setQuestions] = React.useState([])
    const [, lastMessage] = useWebSocket(`wss://senpaqk2re.execute-api.ap-southeast-2.amazonaws.com/stage`)

    React.useEffect(() => {
        if (lastMessage !== null) {
            if (lastMessage.delete) {
                setQuestions(questions.filter(q => q.questionId === lastMessage.questionId))
            } else {
                setQuestions([lastMessage, ...questions])
            }
        }
    }, [lastMessage, blogId])

    React.useEffect(() => {
        async function load() {
            const response = await fetch(`${restUri}/posts/${blogId}/questions`, {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json'
                }
            })

            const body = await response.json()

            setQuestions(body.items)
        }

        load()
    }, [])

    return (
        <React.Fragment>
            <h2>Questions</h2>
            <div>
                {questions.map(function(item) {
                    return <Question key={item.questionId} question={item} blogId={blogId} createPost={createPost} />
                })}
            </div>
        </React.Fragment>
    )
}

const Question = ({ question, blogId }) => {
    const [answer, setAnswer] = React.useState()

    if (!question.content) {
        return null
    }
    const questionText = question.content
    // const questionAuthor = question.content.author
    return (
        <div>
            <div>{questionText}</div>
            <input type="text" value={answer} onChange={e => setAnswer(e.currentTarget.value)} />
            <button
                onClick={async () => {
                    await submitAnswer(blogId, [
                        {
                            kind: 'text',
                            text: `Q: ${questionText}`,
                            intentions: []
                        },
                        {
                            kind: 'text',
                            text: `A: ${answer}`,
                            intentions: []
                        }
                    ])
                    await deleteQuestion(blogId, question.questionId)
                }}
            >
                Answer
            </button>

            <hr />
        </div>
    )
}

async function submitAnswer(blogId, blocks) {
    const url = restUri + '/posts/' + blogId
    const post = {
        posted: new Date().toISOString(),
        blocks: blocks,
        author: 'bob'
    }
    const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(post),
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
        }
    })
    const responseBody = await response.json()
    console.log(response, responseBody)
    post.post = responseBody.postId
    return post
}

async function deleteQuestion(blogId, questionId) {
    await fetch(`${restUri}/posts/${blogId}/questions/${questionId}`, {
        method: 'DELETE'
    })
}
