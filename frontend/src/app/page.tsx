"use client";

import { useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';

export default function Home() {
  const { data: session, status } = useSession();
  const [draftText, setDraftText] = useState('');
  const [file, setFile] = useState<File | null>(null);

  // If loading, you might want to show a loading state
  if (status === "loading") {
    return <div>Loading...</div>
  }

  // If not authenticated, show login button
  if (!session) {
    return (
      <div className="login-container">
        <h1>Cross-Poster</h1>
        <p>Please sign in with your LlamaIndex account to continue</p>
        <button onClick={() => signIn('google')}>
          Sign in with Google
        </button>
      </div>
    );
  }

  const handleSubmit = async () => {
    const formData = new FormData();
    formData.append('text', draftText);
    if (file) {
      formData.append('file', file);
    }

    try {
      // Create EventSource connection
      const eventSource = new EventSource('/api/drafts?' + new URLSearchParams({
        text: draftText,
        ...(file && { fileName: file.name })
      }));

      // Handle incoming events
      eventSource.onmessage = (event) => {
        const eventsList = document.getElementById('draftingEventsList');
        if (eventsList) {
          const li = document.createElement('li');
          li.textContent = event.data;
          eventsList.appendChild(li);
        }
      };

      // Handle errors
      eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        eventSource.close();
      };
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <>
      <h1>Cross-Poster</h1>
      <div className="createDraftsBox">
        <div className="container">
          <div className="enterText">
            <label htmlFor="text">Enter your draft post</label>
            <textarea 
              id="text" 
              name="text" 
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
            />
          </div>
          <div className="uploadMedia">
            <label htmlFor="media">Upload media</label>
            <div
              id="media"
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add('dragover');
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('dragover');
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('dragover');
                const newFile = e.dataTransfer.files[0];
                setFile(newFile);
                const filesList = document.getElementById('droppedFilesList');
                if (filesList) {
                  filesList.innerHTML = `${newFile.name}`;
                }
              }}
            >
              Drop file here
            </div>
            <div className="droppedFiles">
              <div id="droppedFilesList"></div>
            </div>
          </div>
        </div>
        <div className="createDraftButton">
          <button onClick={handleSubmit}>
            Create Drafts
          </button>
        </div>
      </div>
      <div className="drafts">
        <div id="draftingEvents">
          <ul id="draftingEventsList"></ul>
        </div>
      </div>
    </>
  );
}
