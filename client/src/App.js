import React from 'react';
import './App.css';
import ReactQuill from 'react-quill';
import Parser from 'html-react-parser';
//import {} from 'swm-cue-parser/dist/cjs/block';

const restUri = 'https://4odo7ux4lc.execute-api.ap-southeast-2.amazonaws.com/stage';

class PostList extends React.Component {
  render() {
    const posts = this.props.posts.map(function (item) {
      return (
        <div>
          <BlogPost key={item.post} post={item}/>
        </div>
      )
    })
    return <div>{posts}</div>
  }
}

class BlogPost extends React.Component {
  render() {
    return (
      <div id={this.props.key}>
        {Parser(this.props.post.content)}
        <button onClick={() => {
          this.props.editPost(this.props.id)
          }}>edit</button>
      </div>
    )
  }
}

async function submitPost(text) {
  const url = restUri + '/posts/1'
  const body = {
    posted: new Date().toISOString(),
    blocks: [
      {
        kind: 'text',
        text: text,
        intentions: []
      }
    ],
    author: 'bob'
  }
  const response = await fetch(url, {
    method: 'POST',
    cors: 'no-cors',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json'
    },
  })
  const responseBody = await response.json()
  console.log(response,responseBody);
  const post = {
    id: 1,
    post: responseBody.postId,
    content: text
  }
  return post
}

const MyComponent = ({}) => {
  const [text, setText] = React.useState('')
  const [posts, setPosts] = React.useState([])
  const [currentPost, setCurrentPost] = React.useState()

    return (
      <div>
        <ReactQuill value={text}
                    onChange={e => setText(e)} />
        <button onClick={async () => {
            if(!currentPost) {
              const newItem = await submitPost(text)
              setPosts([...posts, newItem])
              setCurrentPost(null)
              setText('')
            }
        }}>Submit</button>
        <PostList posts={posts} />
      </div>
    )
}

function App() {
  return (
    <MyComponent/>
  );
}

export default App;
