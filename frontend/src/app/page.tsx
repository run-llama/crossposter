"use client";

import { useEffect, useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { AuthButtons } from '@/components/AuthButtons'
import { SignOutButton } from '@/components/SignOutButton'
export default function Home() {
  const { data: session, status } = useSession();
  const [draftText, setDraftText] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [user, setUser] = useState(null);
  const [isBlueskyModalOpen, setIsBlueskyModalOpen] = useState(false);

  useEffect(() => {
    if (session) {
      const fetchUser = async () => {
        const response = await fetch('/api/user/fetch');
        const userData = await response.json();
        setUser(userData);
      };
      fetchUser();
    }
  }, [session]);

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
      const eventsList = document.getElementById('draftingEventsList');
      if (!eventsList) {
        console.error("Events list not found");
        return;
      }
      eventsList.innerHTML = "";
    
      eventSource.onmessage = (event) => {
        const li = document.createElement('li');
        const data = JSON.parse(event.data);
        li.textContent = data.msg;
        
        // Add new item
        eventsList.appendChild(li);
        
        // Keep only last 4 items
        while (eventsList.children.length > 4) {
          const firstChild = eventsList.firstChild;
          if (firstChild) {
            eventsList.removeChild(firstChild);
          }
        }

        // Check if workflow is complete
        if (data.msg === 'Workflow completed') {
          eventSource.close();
          setDrafts(data.result);
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

  const handlePost = async (platform: string, draft: string) => {
    console.log("File is", file)

    try {
      const formData = new FormData();
      formData.append('text', draft);
      formData.append('platform', platform);
      if (file) {
        formData.append('media', file);
      }

      const response = await fetch(`/api/post`, {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      console.log(`Successfully posted to ${platform}`);
    } catch (error) {
      console.error(`Error posting to ${platform}:`, error);
    }
  };

  return (
    <>
      <h1>Cross-Poster</h1>
      <AuthButtons user={user} isBlueskyModalOpen={isBlueskyModalOpen} setIsBlueskyModalOpen={setIsBlueskyModalOpen} />
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
        <div id="drafts">
          {Object.entries(drafts).map(([platform, draft]) => (
            <div key={platform} className="draft">
              <h3>{platform}</h3>
              <form onSubmit={async (e) => {
                e.preventDefault();
                await handlePost(platform, draft);
              }}>
                <div className="draftText">
                  <textarea 
                    name="text"
                    value={draft}
                    readOnly
                  />
                  <button type="submit">Post to {platform}</button>
                </div>
              </form>
            </div>
          ))}
        </div>
      </div>
      <div className="signOutButton">
        <SignOutButton />
      </div>
    </>
  );
}
