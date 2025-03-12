"use client";

import { useEffect, useState, useRef } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { AuthButtons } from '@/components/AuthButtons'
import providerNames from '@/util/platformNames'

type HandleMap = Record<string, Record<string, string>>;

// Add this interface near the top of the file, after the HandleMap type
interface TwitterPostResponse {
  data: {
    id: string;
  }
}

interface LinkedInPostResponse {
  id: string;
}

interface BlueskyPostResponse {
  url: string;
}

export default function Home() {
  const { data: session, status } = useSession();
  const dialogRef = useRef<HTMLDialogElement>(null) as React.RefObject<HTMLDialogElement>;
  const linkedInOrgDialogRef = useRef<HTMLDialogElement>(null) as React.RefObject<HTMLDialogElement>;
  const [draftText, setDraftText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [user, setUser] = useState(null);
  const [isBlueskyModalOpen, setIsBlueskyModalOpen] = useState(false);
  const [editableDrafts, setEditableDrafts] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [handles, setHandles] = useState<HandleMap | undefined>();
  const [eventsList, setEventsList] = useState<string[]>([]);
  const [linkedInOrganization, setLinkedInOrganization] = useState<string | null>(null);
  const [twitterPostResult, setTwitterPostResult] = useState<TwitterPostResponse | null>(null);
  const [linkedinPostResult, setLinkedinPostResult] = useState<LinkedInPostResponse | null>(null);
  const [blueskyPostResult, setBlueskyPostResult] = useState<BlueskyPostResponse | null>(null);
  const [activeTab, setActiveTab] = useState('app');
  
  useEffect(() => {
    if (session) {
      const fetchUser = async () => {
        const response = await fetch('/api/user/fetch');
        const userData = await response.json();
        setUser(userData);
        setLinkedInOrganization(userData.linkedin_company);
      };
      fetchUser();
    }
  }, [session]);

  const handleSubmit = async () => {
    if (!draftText) {
      setErrorMessage('Please enter text so we can create drafts.');
      const dialog = document.querySelector('dialog');
      dialog?.showModal();
      return;
    }

    const formData = new FormData();
    formData.append('text', draftText);
    formData.append('file', file);

    try {
      // Create EventSource connection
      const eventSource = new EventSource('/api/drafts?' + new URLSearchParams({
        text: draftText,
        ...(file && { fileName: file.name })
      }));

      // Handle incoming events
      setHandles(undefined)
      setEventsList(["Creating drafts..."]);
      setEditableDrafts({})
    
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        // Check if workflow is complete
        if (data.msg === 'Workflow completed') {
          eventSource.close();
          setEditableDrafts(data.result);
          setHandles(data.handles);
          return
        }       
        
        // otherwise keep the running list of no more than 4 items
        setEventsList(prev => [...prev.slice(-3), data.msg].slice(-4));

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
      switch(platform) {
        case "twitter":
          setTwitterPostResult(await response.json());
          break;
        case "linkedin":
          setLinkedinPostResult(await response.json());
          break;
        case "bluesky":
          setBlueskyPostResult(await response.json());
          break;
      }

    } catch (error) {
      console.error(`Error posting to ${platform}:`, error);
      setErrorMessage(`Error posting to ${platform}: ${error}`);
      const dialog = document.querySelector('dialog');
      dialog?.showModal();
    }
  };

  const renderAppContent = () => {
    if (status === "loading") {
      return <div>Loading...</div>
    }

    if (!session) {
      return (
        <div className="login-container">
          <p>CrossPoster is a tool for quickly posting to multiple social media platforms while adapting the content to each platform.</p>
          <h2>Features</h2>
          <ul>
            <li>Post to Twitter (X), LinkedIn, and Bluesky
              <ul>
                <li>LinkedIn posts can be posted to a company page or an individual profile</li>
              </ul>
            </li>
            <li>Attach images to all posts</li>
            <li>Entities (people, companies, etc.) mentioned in your draft will be identified and appropriately @-mentioned on each platform (if accounts exist)</li>
            <li>Supports long content for Twitter and LinkedIn; automatically shortens long posts for BlueSky.</li>
          </ul>
          <p>Please sign in with any Google account to continue.</p>
          <button onClick={() => signIn('google')}>
            Sign in with Google
          </button>
        </div>
      );
    }

    return (
      <>
        <AuthButtons 
          user={user}
          setUser={setUser}
          isBlueskyModalOpen={isBlueskyModalOpen} 
          setIsBlueskyModalOpen={setIsBlueskyModalOpen} 
          dialogRef={dialogRef}
          linkedInOrgDialogRef={linkedInOrgDialogRef}
          selectedPlatform={selectedPlatform}
          setSelectedPlatform={setSelectedPlatform}
          linkedInOrganization={linkedInOrganization}
          setLinkedInOrganization={setLinkedInOrganization}
        />
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
                  if (newFile.type.startsWith('image/')) {
                    setFile(newFile);
                    const reader = new FileReader();
                    reader.onload = (e) => {
                      const dropZone = document.getElementById('media');
                      if (dropZone) {
                        dropZone.style.backgroundImage = `url(${e.target?.result})`;
                        dropZone.style.backgroundSize = 'contain';
                        dropZone.style.backgroundPosition = 'center';
                        dropZone.style.backgroundRepeat = 'no-repeat';
                      }
                    };
                    reader.readAsDataURL(newFile);
                  }
                }}
              >
                {!file && 'Drop file here'}
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
            {handles ? (
              <div id="foundHandles">
                <h2>Entities were translated to these handles:</h2>
                <div className="platforms">
                {Object.keys(handles).map(
                  (platform) => (
                    <div className="platform" key={platform}>
                      <h3>{providerNames[platform as keyof typeof providerNames]}</h3>
                      {Object.keys(handles[platform]).map((handle) => (
                        <div key={platform + "_" + handle}>{handle}: {handles[platform][handle]}</div>
                      ))}
                    </div>
                  )
                )}
                </div>
              </div>
            ) : (
              <ul id="draftingEventsList">
                {eventsList.map((event) => (
                  <li key={event}>{event}</li>
                ))}
              </ul>
            )}
          </div>
          <div id="drafts">
            {Object.entries(editableDrafts).map(([platform, draft]) => (
              <div key={platform} className="draft">
                <h3>{providerNames[platform as keyof typeof providerNames]}</h3>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  await handlePost(platform, editableDrafts[platform]);
                }}>
                  <div className="draftText">
                    <textarea 
                      name="text"
                      value={editableDrafts[platform] || ''}
                      onChange={(e) => setEditableDrafts(prev => ({
                        ...prev,
                        [platform]: e.target.value
                      }))}
                    />
                    <button type="submit">Post to {providerNames[platform as keyof typeof providerNames]}</button>
                    {platform === "twitter" && twitterPostResult && (
                      <div>
                        <h4>Posted!</h4>
                        <p><a href={`https://x.com/anybody/status/${twitterPostResult.data.id}`} target="_blank">See tweet</a></p>
                      </div>
                    )}
                    {platform === "linkedin" && linkedinPostResult && (
                      <div>
                        <h4>Posted!</h4>
                        <p><a href={`https://www.linkedin.com/feed/update/${linkedinPostResult.id}`} target="_blank">See post</a></p>
                      </div>
                    )}
                    {platform === "bluesky" && blueskyPostResult && (
                      <div>
                        <h4>Posted!</h4>
                        <p><a href={blueskyPostResult.url} target="_blank">See post</a></p>
                      </div>
                    )}
                  </div>
                </form>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  };

  const renderInstructionsContent = () => {
    return (
      <div className="instructions">
        <h2>How to Use CrossPoster</h2>
        <ul>
          <li>Sign in using your Google account (we don't use it for anything but sign-in)</li>
          <li>Connect your social media accounts using the buttons at the top.
            <ul>
              <li>For X you must connect with the account you're going to post from.</li>
              <li>Connect your personal LinkedIn account. To post to a company page, click the "as yourself" text and enter the "vanity name" of the company, this is the bit that appears at the end of the company's URL on LinkedIn, e.g. "https://www.linkedin.com/company/<b>vanity-name</b>/
              <ul>
                <li>The LinkedIn API is really annoying, let me tell you.</li>
              </ul>
              </li>
              <li>Bluesky OAuth was too tricky; generate an <a href="https://bsky.app/settings/app-passwords">app password</a> and supply that.</li>
            </ul>
          </li>
          <li>Enter your post text in the text area. Use regular English names for people and companies, CrossPoster is going to search the web for their social media handles for you.</li>
          <li>Upload an image</li>
          <li>Click "Create Drafts" to generate platform-specific versions</li>
          <li>Review and edit the generated drafts. In particular, check that the mentions go to the right places! Sometimes the web search turns up false positives.</li>
          <li>Post to each platform using the "Post to..." buttons</li>
        </ul>
        <h2>Limitations and Caveats</h2>
        <ul>
          <li>Currently, the image is required for all posts. Sorry! We always post with images.</li>
          <li>But only one image per post. Look, we're working on it.</li>
          <li>Video attachments are not currently supported.</li>

        </ul>
      </div>
    );
  };

  return (
    <div id="main">
      <h1>CrossPoster</h1>
      <dialog onClick={(e) => {
        const dialog = document.querySelector('dialog');
        dialog?.close();
      }}>
        <div className="dialog-content">
          <p>{errorMessage}</p>
          <button onClick={(e) => {
            const dialog = document.querySelector('dialog');
            dialog?.close();
          }}>Close</button>
        </div>
      </dialog>
      
      <div className="tabs">
        <button 
          className={activeTab === 'app' ? 'active' : ''} 
          onClick={() => setActiveTab('app')}
        >
          App
        </button>
        <button 
          className={activeTab === 'instructions' ? 'active' : ''} 
          onClick={() => setActiveTab('instructions')}
        >
          Instructions
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'app' ? renderAppContent() : renderInstructionsContent()}
      </div>

      <div className="footer">
        <p>Written by <a href="https://bsky.app/profile/seldo.com">Laurie Voss</a> using <a href="https://ts.llamaindex.ai/">LlamaIndex.TS</a>.</p>
        <p>CrossPoster is <a href="https://github.com/run-llama/crossposter">open source</a>! You are welcome to submit issues and pull requests via GitHub.</p>
        <p><a href="/privacy-policy">Privacy Policy</a> | <a href="/terms-of-service">Terms of Service</a></p>

      </div>
    </div>
  );
}
