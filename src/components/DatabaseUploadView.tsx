import React, { useState, useCallback } from 'react';
import { UploadCloud, Shield, CheckCircle, AlertTriangle } from 'lucide-react';
import { initDatabaseFromBuffer, getDbStats } from '../utils/db';

interface DatabaseUploadViewProps {
  onDbLoaded: (version: number) => void;
}

export function DatabaseUploadView({ onDbLoaded }: DatabaseUploadViewProps) {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const processFile = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(buffer);

      // Simple header sanity check for SQLite (starts with "SQLite format 3")
      const headerBytes = uint8.slice(0, 15);
      const headerStr = new TextDecoder().decode(headerBytes);
      if (!headerStr.startsWith("SQLite format 3")) {
        throw new Error("Invalid file format. The file must be a SQLite database (e.g., db.sqlite).");
      }

      // Initialize the database in memory
      await initDatabaseFromBuffer(uint8);

      // Validate tables and retrieve version stats
      const stats = await getDbStats();
      if (stats.counts.datasheets === 0) {
        throw new Error("The uploaded database is empty or does not contain WH40k datasheet tables.");
      }

      setSuccess(true);
      setTimeout(() => {
        onDbLoaded(stats.dataVersion);
      }, 1000);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to process the SQLite file. Please check that it is a valid database.");
      setLoading(false);
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div className="db-upload-screen">
      <div className="db-upload-card">
        <div className="db-upload-icon-header">
          <Shield className="shield-glow-icon" size={48} />
        </div>
        
        <h1 className="db-upload-title">Tactical Database Activation</h1>
        <p className="db-upload-subtitle">
          Welcome to the <strong>Tactical Cognis Munitorum</strong>. This software package contains no Game Intellectual Property. 
          To initialize the calculations engine, please provide your own extracted <code>db.sqlite</code> database backup.
        </p>

        {error && (
          <div className="db-upload-alert error">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="db-upload-alert success">
            <CheckCircle size={18} />
            <span>Core database decrypted. Syncing registries...</span>
          </div>
        )}

        <div 
          className={`db-upload-dropzone ${dragActive ? 'active' : ''} ${loading ? 'loading' : ''}`}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
        >
          {loading ? (
            <div className="loader-container">
              <div className="spinner"></div>
              <span>Processing SQLite Database...</span>
            </div>
          ) : (
            <>
              <UploadCloud size={48} className="cloud-icon" />
              <p>Drag and drop your <strong>db.sqlite</strong> file here</p>
              <span className="or-divider">or</span>
              <label htmlFor="file-upload" className="file-upload-btn">
                Browse Files
              </label>
              <input 
                id="file-upload" 
                type="file" 
                onChange={handleFileInput} 
                accept=".sqlite,.db" 
                style={{ display: 'none' }} 
              />
            </>
          )}
        </div>

        <div className="db-upload-instructions">
          <h3>📌 How to get your SQLite database (Mac):</h3>
          <ol>
            <li>Launch the official WH40k Companion App at least once (it must have run to create its local database).</li>
            <li>
              Find it:{' '}
              <code>find ~/Library/Containers -iname db.sqlite -path '*Application Support*'</code>
            </li>
            <li>
              Make a safe copy (don't just drag the raw file — it may be split across WAL journal
              files):{' '}
              <code>sqlite3 "file:&lt;path-from-above&gt;?mode=ro" ".backup '$HOME/Desktop/db.sqlite'"</code>
            </li>
            <li>Drop the resulting <code>db.sqlite</code> file from your Desktop above to initialize faction datasheets and stats in-memory, securely, on your device.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
