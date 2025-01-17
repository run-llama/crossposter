import { useState, useEffect, useRef } from 'react';

interface BlueskyConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BlueskyConnectModal({ isOpen, onClose }: BlueskyConnectModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams({
      provider: 'bluesky',
      token: username,
      secret: password
    });
    window.location.href = `/api/user/save-token?${params.toString()}`;
  };

  return (
    <dialog 
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="modal-content">
        <h2>Connect Bluesky Account</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-fields">
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>App Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="button-group">
              <button
                type="button"
                onClick={onClose}
                className="cancel-button"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="submit-button"
              >
                Connect
              </button>
            </div>
          </div>
        </form>
      </div>

      <style jsx>{`
        dialog {
          padding: 0;
          border: none;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }

        dialog::backdrop {
          background: rgba(0, 0, 0, 0.3);
        }

        .modal-content {
          padding: 24px;
          max-width: 400px;
        }

        h2 {
          font-size: 1.125rem;
          font-weight: 500;
          margin-bottom: 1rem;
        }

        .form-fields {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        label {
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
        }

        input {
          padding: 0.5rem;
          border: 1px solid #D1D5DB;
          border-radius: 6px;
          width: 100%;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        .button-group {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          margin-top: 1rem;
        }

        button {
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
        }

        .cancel-button {
          background-color: white;
          border: 1px solid #D1D5DB;
          color: #374151;
        }

        .cancel-button:hover {
          background-color: #F3F4F6;
        }

        .submit-button {
          background-color: #2563EB;
          border: none;
          color: white;
        }

        .submit-button:hover {
          background-color: #1D4ED8;
        }
      `}</style>
    </dialog>
  );
} 
