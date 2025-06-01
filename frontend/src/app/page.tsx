"use client";

import { useEffect, useState, useRef, useMemo } from 'react';
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

type DomainRule = {
  domain: string;
  source: string;
  medium: string;
  campaign: string;
};

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
  const [isDrafting, setIsDrafting] = useState(false);
  const [isPosting, setIsPosting] = useState<{ [platform: string]: boolean }>({});
  const [newDomain, setNewDomain] = useState<DomainRule>({
    domain: '',
    source: '',
    medium: '',
    campaign: ''
  });
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingRow, setEditingRow] = useState<DomainRule | null>(null);
  
  // Memoize object URL for video preview
  const videoUrl = useMemo(() => {
    if (file && file.type.startsWith('video/')) {
      return URL.createObjectURL(file);
    }
    return null;
  }, [file]);

  useEffect(() => {
    // Clean up the object URL when file changes or component unmounts
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

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

    // Check for video file size > 4MB
    if (file && file.type.startsWith('video/') && file.size > 4 * 1024 * 1024) {
      setErrorMessage('Video files larger than 4MB are not supported.');
      const dialog = document.querySelector('dialog');
      dialog?.showModal();
      return;
    }

    const formData = new FormData();
    formData.append('text', draftText);
    if (file) formData.append('file', file);

    try {
      // Create EventSource connection
      setIsDrafting(true);
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
          setIsDrafting(false);
          return
        }       
        
        // otherwise keep the running list of no more than 4 items
        setEventsList(prev => [...prev.slice(-3), data.msg].slice(-4));

      };

      // Handle errors
      eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        eventSource.close();
        setIsDrafting(false);
      };
    } catch (error) {
      console.error('Error:', error);
      setIsDrafting(false);
    }
  };

  const handlePost = async (platform: string, draft: string) => {
    console.log("File is", file)

    try {
      setIsPosting(prev => ({ ...prev, [platform]: true }));
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
        setIsPosting(prev => ({ ...prev, [platform]: false }));
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
      setIsPosting(prev => ({ ...prev, [platform]: false }));

    } catch (error) {
      console.error(`Error posting to ${platform}:`, error);
      setErrorMessage(`Error posting to ${platform}: ${error}`);
      const dialog = document.querySelector('dialog');
      dialog?.showModal();
      setIsPosting(prev => ({ ...prev, [platform]: false }));
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
                  if (newFile && (newFile.type.startsWith('image/') || newFile.type.startsWith('video/'))) {
                    setFile(newFile);
                    const dropZone = document.getElementById('media');
                    if (dropZone) {
                      if (newFile.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                          dropZone.style.backgroundImage = `url(${e.target?.result})`;
                          dropZone.style.backgroundSize = 'contain';
                          dropZone.style.backgroundPosition = 'center';
                          dropZone.style.backgroundRepeat = 'no-repeat';
                        };
                        reader.readAsDataURL(newFile);
                      } else if (newFile.type.startsWith('video/')) {
                        dropZone.style.backgroundImage = '';
                      }
                    }
                  }
                }}
                onClick={() => {
                  const fileInput = document.getElementById('mediaFileInput');
                  if (fileInput) {
                    fileInput.click();
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                {!file && 'Drag file here or click to select'}
                {file && file.type.startsWith('video/') && (
                  <video
                    src={videoUrl || undefined}
                    controls
                    style={{ maxWidth: '100%', maxHeight: '100%' }}
                  />
                )}
                <input
                  id="mediaFileInput"
                  type="file"
                  accept="image/*,video/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const newFile = e.target.files && e.target.files[0];
                    if (newFile && (newFile.type.startsWith('image/') || newFile.type.startsWith('video/'))) {
                      setFile(newFile);
                      const dropZone = document.getElementById('media');
                      if (dropZone) {
                        if (newFile.type.startsWith('image/')) {
                          const reader = new FileReader();
                          reader.onload = (e) => {
                            dropZone.style.backgroundImage = `url(${e.target?.result})`;
                            dropZone.style.backgroundSize = 'contain';
                            dropZone.style.backgroundPosition = 'center';
                            dropZone.style.backgroundRepeat = 'no-repeat';
                          };
                          reader.readAsDataURL(newFile);
                        } else if (newFile.type.startsWith('video/')) {
                          dropZone.style.backgroundImage = '';
                        }
                      }
                    }
                  }}
                />
                {file && file.type.startsWith('image/') && (
                  // No need to show a separate preview, background image is set
                  null
                )}
              </div>
            </div>
          </div>
          <div className="createDraftButton">
            <button onClick={handleSubmit}>
              Create Drafts
            </button>
            {isDrafting && (
              <span className="spinner" style={{ marginLeft: '10px', verticalAlign: 'middle' }}>
                <style>{`
                  .spinner:after {
                    content: '';
                    display: inline-block;
                    width: 16px;
                    height: 16px;
                    border: 2px solid #ccc;
                    border-top: 2px solid #333;
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                    vertical-align: middle;
                  }
                  @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                `}</style>
              </span>
            )}
          </div>
        </div>
        <div className="drafts">
          <div id="draftingEvents">
            {handles && Object.keys(handles['twitter']).length > 0 ? (
              <div id="foundHandles">
                <h2>Entities were translated to these handles:</h2>
                <p>We recommend checking these links to make sure they're correct.</p>
                <div className="platforms">
                {Object.keys(handles).map(
                  (platform) => (
                    <div className="platform" key={platform}>
                      <h3>{providerNames[platform as keyof typeof providerNames]}</h3>
                      {Object.keys(handles[platform]).map((handle) => {
                        const value = handles[platform][handle];
                        let url = null;
                        if (platform === 'twitter' && value && value.startsWith('@')) {
                          url = `https://x.com/${value.substring(1)}`;
                        } else if (platform === 'linkedin' && value) {
                          url = value;
                        } else if (platform === 'bluesky' && value) {
                          url = value.startsWith('http') ? value : `https://bsky.app/profile/${value.replace(/^@/, '')}`;
                        }
                        return (
                          <div key={platform + "_" + handle}>
                            {handle}: {url ? (
                              <a href={url} target="_blank" rel="noopener noreferrer">{value}</a>
                            ) : (
                              value
                            )}
                          </div>
                        );
                      })}
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
                    {isPosting[platform] && (
                      <span className="spinner" style={{ marginLeft: '10px', verticalAlign: 'middle' }}>
                        <style>{`
                          .spinner:after {
                            content: '';
                            display: inline-block;
                            width: 16px;
                            height: 16px;
                            border: 2px solid #ccc;
                            border-top: 2px solid #333;
                            border-radius: 50%;
                            animation: spin 0.8s linear infinite;
                            vertical-align: middle;
                          }
                          @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                          }
                        `}</style>
                      </span>
                    )}
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
          <li>Upload an image or a video to attach to your post (optional). Videos must be less than 4MB (LinkedIn's limit) and 3 minutes long (Bluesky's limit).</li>
          <li>Click "Create Drafts" to generate platform-specific versions</li>
          <li>Review and edit the generated drafts. In particular, check that the mentions go to the right places! Sometimes the web search turns up false positives.</li>
          <li>Post to each platform using the "Post to..." buttons</li>
        </ul>
        <h2>Limitations and Caveats</h2>
        <ul>
          <li>You can only attach one image per post right now.</li>
          <li>Video attachments are not currently supported.</li>
        </ul>
      </div>
    );
  };

  const renderUTMRulesContent = (
    newDomain: DomainRule,
    setNewDomain: React.Dispatch<React.SetStateAction<DomainRule>>,
    editingIdx: number | null,
    setEditingIdx: React.Dispatch<React.SetStateAction<number | null>>,
    editingRow: DomainRule | null,
    setEditingRow: React.Dispatch<React.SetStateAction<DomainRule | null>>
  ) => {
    // Parse user['utm_rules'] as JSON if present
    let utmRulesObj: { domains: DomainRule[] } = { domains: [] };
    try {
      if (user && user['utm_rules']) {
        utmRulesObj = JSON.parse(user['utm_rules']);
      }
    } catch (e) {
      // fallback to empty if parsing fails
      utmRulesObj = { domains: [] };
    }

    // Save handler for new row
    const handleSave = async () => {
      // Don't add if all fields are empty
      if (!newDomain.domain && !newDomain.source && !newDomain.medium && !newDomain.campaign) return;
      const updatedRules = {
        domains: [
          ...utmRulesObj.domains,
          { ...newDomain }
        ]
      };
      await fetch('/api/user/save-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utm_rules: updatedRules })
      });
      setNewDomain({ domain: '', source: '', medium: '', campaign: '' });
      // Re-fetch user data and update state
      const response = await fetch('/api/user/fetch');
      const userData = await response.json();
      setUser(userData);
      setEditingIdx(null);
      setEditingRow(null);
    };

    // Save handler for editing row
    const handleEditSave = async (idx: number) => {
      if (editingRow == null) return;
      const updatedDomains = utmRulesObj.domains.map((row, i) =>
        i === idx ? { ...editingRow } : row
      );
      const updatedRules = { domains: updatedDomains };
      await fetch('/api/user/save-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utm_rules: updatedRules })
      });
      // Re-fetch user data and update state
      const response = await fetch('/api/user/fetch');
      const userData = await response.json();
      setUser(userData);
      setEditingIdx(null);
      setEditingRow(null);
    };

    // Delete handler for a row
    const handleDelete = async (idx: number) => {
      const updatedDomains = utmRulesObj.domains.filter((_, i) => i !== idx);
      const updatedRules = { domains: updatedDomains };
      await fetch('/api/user/save-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utm_rules: updatedRules })
      });
      // Re-fetch user data and update state
      const response = await fetch('/api/user/fetch');
      const userData = await response.json();
      setUser(userData);
      setEditingIdx(null);
      setEditingRow(null);
    };

    // Table rendering
    return (
      <div className="instructions">
        <h2>UTM Rules for Link Tracking</h2>
        <p>
          UTM parameters are tags you can add to your URLs to track the performance of campaigns and content. When someone clicks a link with UTM parameters, the information is sent to your analytics platform (like Google Analytics), so you can see where your traffic is coming from.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '2em' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #ccc', padding: '8px' }}>Domain</th>
              <th style={{ border: '1px solid #ccc', padding: '8px' }}>Source</th>
              <th style={{ border: '1px solid #ccc', padding: '8px' }}>Medium</th>
              <th style={{ border: '1px solid #ccc', padding: '8px' }}>Campaign</th>
              <th style={{ border: '1px solid #ccc', padding: '8px' }}></th>
            </tr>
          </thead>
          <tbody>
            {utmRulesObj.domains.map((row, idx) => (
              <tr key={row.domain + idx}>
                <td style={{ border: '1px solid #ccc', padding: '8px' }} onClick={() => {
                  if (editingIdx !== idx) {
                    setEditingIdx(idx);
                    setEditingRow({ ...row });
                  }
                }}>
                  {editingIdx === idx && editingRow ? (
                    <input
                      type="text"
                      value={editingRow.domain}
                      onChange={e => setEditingRow({ ...editingRow, domain: e.target.value })}
                      style={{ width: '100%' }}
                      autoFocus
                    />
                  ) : row.domain}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }} onClick={() => {
                  if (editingIdx !== idx) {
                    setEditingIdx(idx);
                    setEditingRow({ ...row });
                  }
                }}>
                  {editingIdx === idx && editingRow ? (
                    <input
                      type="text"
                      value={editingRow.source}
                      onChange={e => setEditingRow({ ...editingRow, source: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  ) : row.source}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }} onClick={() => {
                  if (editingIdx !== idx) {
                    setEditingIdx(idx);
                    setEditingRow({ ...row });
                  }
                }}>
                  {editingIdx === idx && editingRow ? (
                    <input
                      type="text"
                      value={editingRow.medium}
                      onChange={e => setEditingRow({ ...editingRow, medium: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  ) : row.medium}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }} onClick={() => {
                  if (editingIdx !== idx) {
                    setEditingIdx(idx);
                    setEditingRow({ ...row });
                  }
                }}>
                  {editingIdx === idx && editingRow ? (
                    <input
                      type="text"
                      value={editingRow.campaign}
                      onChange={e => setEditingRow({ ...editingRow, campaign: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  ) : row.campaign}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'center' }}>
                  {editingIdx === idx ? (
                    <button type="button" onClick={() => handleEditSave(idx)}>Save</button>
                  ) : (
                    <button type="button" onClick={() => handleDelete(idx)}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                <input
                  type="text"
                  value={newDomain.domain}
                  onChange={e => setNewDomain({ ...newDomain, domain: e.target.value })}
                  placeholder="Domain"
                  style={{ width: '100%' }}
                />
              </td>
              <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                <input
                  type="text"
                  value={newDomain.source}
                  onChange={e => setNewDomain({ ...newDomain, source: e.target.value })}
                  placeholder="Source"
                  style={{ width: '100%' }}
                />
              </td>
              <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                <input
                  type="text"
                  value={newDomain.medium}
                  onChange={e => setNewDomain({ ...newDomain, medium: e.target.value })}
                  placeholder="Medium"
                  style={{ width: '100%' }}
                />
              </td>
              <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                <input
                  type="text"
                  value={newDomain.campaign}
                  onChange={e => setNewDomain({ ...newDomain, campaign: e.target.value })}
                  placeholder="Campaign"
                  style={{ width: '100%' }}
                />
              </td>
              <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'center' }}>
                <button type="button" onClick={handleSave}>Save</button>
              </td>
            </tr>
          </tbody>
        </table>
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
        {session && (
          <button
            className={activeTab === 'utm' ? 'active' : ''}
            onClick={() => setActiveTab('utm')}
          >
            UTM Rules
          </button>
        )}
      </div>

      <div className="tab-content">
        {activeTab === 'app' ? renderAppContent() :
          activeTab === 'instructions' ? renderInstructionsContent() :
          (session && activeTab === 'utm' ? renderUTMRulesContent(newDomain, setNewDomain, editingIdx, setEditingIdx, editingRow, setEditingRow) : null)}
      </div>

      <div className="footer">
        <p>Written by <a href="https://bsky.app/profile/seldo.com">Laurie Voss</a> using <a href="https://ts.llamaindex.ai/">LlamaIndex.TS</a>.</p>
        <p>CrossPoster is <a href="https://github.com/run-llama/crossposter">open source</a>! You are welcome to submit issues and pull requests via GitHub.</p>
        <p><a href="/privacy-policy">Privacy Policy</a> | <a href="/terms-of-service">Terms of Service</a></p>

      </div>
    </div>
  );
}
