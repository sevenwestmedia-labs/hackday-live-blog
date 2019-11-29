import React from 'react'
import './App.css'
import { css } from 'emotion'
import ReactQuill from 'react-quill'
import Parser from 'html-react-parser'
//import {} from 'swm-cue-parser/dist/cjs/block';

const restUri = 'https://4odo7ux4lc.execute-api.ap-southeast-2.amazonaws.com/stage'
const blogId = 1

class StatusBar extends React.Component {
    render() {
        var status
        const post = this.props.currentPost
        if (post) {
            status = 'Editiing post ' + post.post + ' published at ' + post.content.posted
        } else {
            status = 'Add a new post'
        }
        return <div>{status}</div>
    }
}

class PostList extends React.Component {
    render() {
        const editPost = this.props.editPost
        const posts = this.props.posts.map(function(item, index) {
            console.log(item)
            return (
              <BlogPost key={item.post} index={index} post={item} editPost={editPost} />
            )
        })
        return posts
    }
}

class BlogPost extends React.Component {
    render() {
        const content = this.props.post.content
        const index = this.props.index
        const editPost = this.props.editPost
        return (
            <div id={index}>
                <header>{content.posted}</header>
                <p>{Parser(content.blocks ? content.blocks[0].text : '')}</p>
                <button
                    onClick={() => {
                        editPost(index)
                    }}
                >
                    edit
                </button>
            </div>
        )
    }
}

const QuestionList = ({ questions }) => {
    return (
        <React.Fragment>
            <h2>Questions</h2>
            <div>
                {questions.map(function(item) {
                    return <Question key={item.id} question={item} />
                })}
            </div>
        </React.Fragment>
    )
}

class Question extends React.Component {
    render() {
        return (
            <div id={this.props.key}>
                {Parser(this.props.question.content)}
                <button
                    onClick={() => {
                        this.props.editPost(this.props.id)
                    }}
                >
                    Answer
                </button>
            </div>
        )
    }
}

function stripHtml(html) {
    var tmp = document.createElement('DIV')
    tmp.innerHTML = html
    return tmp.textContent || tmp.innerText || ''
}

async function getPosts(setPosts) {
    const url = `${restUri}/posts/${blogId}`
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
        }
    })
    const responseBody = await response.json()
    //console.log(response, responseBody)

    if(responseBody.items) {
        setPosts(responseBody.items)
    }
}

async function submitPost(text) {
    const url = restUri + '/posts/' + blogId
    const stripped = stripHtml(text)
    const content = {
        posted: new Date().toISOString(),
        blocks: [
            {
                kind: 'text',
                text: stripped,
                intentions: []
            }
        ],
        author: 'bob'
    }
    const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(content),
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
        }
    })
    const responseBody = await response.json()
    //console.log(response, responseBody)
    const post = {
        id: blogId,
        post: responseBody.postId,
        content: content
    }
    return post
}

async function submitPut(post) {
    //console.log(post)
    const url = restUri + `/posts/${blogId}/${post.post}`
    const response = await fetch(url, {
        method: 'PUT',
        body: JSON.stringify(post),
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
        }
    })
    return post
}

const MyComponent = () => {
    const [text, setText] = React.useState('')
    const [posts, setPosts] = React.useState([])
    const [questions, setQuestions] = React.useState([])
    const [currentPostIndex, setCurrentPostIndex] = React.useState()
    const [currentPost, setCurrentPost] = React.useState()
    const [currentQuestion, setCurrentQuestion] = React.useState()

    React.useEffect(() => {
        getPosts(setPosts)
    },[])

    return (
        <div
            className={css({
                display: 'grid',
                gridTemplateColumns: '2fr 1fr',
                gridColumnGap: '18px',
                height: '100vh',
                margin: '18px'
            })}
        >
            <div className={css({ display: 'grid', gridTemplateRows: 'min-content min-content auto' })}>
                <h2>Live blog admin</h2>
                <div>
                    <StatusBar currentPost={currentPost} currentQuestion={currentQuestion} />
                    <ReactQuill value={text} onChange={e => setText(e)} />
                    <button
                        onClick={async () => {
                            if (!currentPost) {
                                const newItem = await submitPost(text)
                                setPosts([newItem, ...posts])
                                setCurrentPost(null)
                                setText('')
                            } else {
                                const newPosts = posts.slice()
                                //console.log(currentPostIndex)
                                newPosts[currentPostIndex].content.blocks[0].text = stripHtml(text)
                                setPosts(newPosts)
                                await submitPut(newPosts[currentPostIndex])
                                setCurrentPostIndex(null)
                                setCurrentPost(null)
                                setText('')
                            }
                        }}
                    >
                        {currentPost ? 'Edit' : 'Submit'}
                    </button>
                    <button
                        onClick={async () => {
                            setCurrentPost(null)
                            setText('')
                        }}
                    >
                        Cancel
                    </button>
                </div>
                <div id="posts" className={css({ overflowY: 'auto' })}>
                    <PostList
                        posts={posts}
                        editPost={index => {
                            const currentPost = posts[index]
                            setCurrentPost(currentPost)
                            setCurrentPostIndex(index)
                            setText(currentPost.content.blocks[0].text)
                        }}
                    />
                </div>
            </div>
            <div>
                <QuestionList questions={questions} />
            </div>
        </div>
    )
}

function App() {
    return <MyComponent />
}

export default App
