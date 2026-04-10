import React, { useState } from 'react';

const AdminPanel: React.FC = () => {
    const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error' | 'idle', message: string }>({ type: 'idle', message: '' });
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const response = await fetch('http://127.0.0.1:8000/export/');
            if (!response.ok) throw new Error('Export failed');
            
            const data = await response.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `paraclete-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export error:', error);
            alert('Failed to export data');
        } finally {
            setIsExporting(false);
        }
    };

    const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!confirm('Warning: Importing data will OVERWRITE all existing data in the application. Are you sure you want to proceed?')) {
            event.target.value = '';
            return;
        }

        setIsImporting(true);
        setImportStatus({ type: 'idle', message: 'Importing...' });

        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const content = e.target?.result as string;
                    const data = JSON.parse(content);

                    const response = await fetch('http://127.0.0.1:8000/import/', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(data),
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.detail || 'Import failed');
                    }

                    setImportStatus({ type: 'success', message: 'Data imported successfully! Please restart or refresh the application.' });
                } catch (err: any) {
                    setImportStatus({ type: 'error', message: `Import failed: ${err.message}` });
                } finally {
                    setIsImporting(false);
                }
            };
            reader.readAsText(file);
        } catch (error: any) {
            setImportStatus({ type: 'error', message: `File reading failed: ${error.message}` });
            setIsImporting(false);
        }
    };

    return (
        <div className="admin-panel animate-in">
            <div className="card" style={{ maxWidth: '800px' }}>
                <header style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>Administrative Controls</h3>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Manage your application data, configuration, and system settings.
                    </p>
                </header>

                <div className="admin-section" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '24px' }}>
                    <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ opacity: 0.7 }}>📦</span> Data Portability
                    </h4>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div className="admin-card" style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            <h5 style={{ fontWeight: 600, marginBottom: '8px' }}>Export</h5>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                                Download a complete JSON snapshot of your persons, groups, notes, and references.
                            </p>
                            <button 
                                className="btn-secondary" 
                                onClick={handleExport}
                                disabled={isExporting}
                                style={{ width: '100%' }}
                            >
                                {isExporting ? 'Exporting...' : 'Generate Export JSON'}
                            </button>
                        </div>

                        <div className="admin-card" style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            <h5 style={{ fontWeight: 600, marginBottom: '8px' }}>Import</h5>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                                Restore data from a previously exported JSON file. <strong>Warning: This overwrites current data.</strong>
                            </p>
                            <label className="btn-secondary" style={{ width: '100%', display: 'inline-block', textAlign: 'center', cursor: isImporting ? 'not-allowed' : 'pointer', opacity: isImporting ? 0.7 : 1 }}>
                                {isImporting ? 'Importing...' : 'Upload Import JSON'}
                                <input 
                                    type="file" 
                                    accept=".json" 
                                    onChange={handleImport} 
                                    style={{ display: 'none' }} 
                                    disabled={isImporting}
                                />
                            </label>
                        </div>
                    </div>

                    {importStatus.type !== 'idle' && (
                        <div style={{ 
                            marginTop: '20px', 
                            padding: '12px 16px', 
                            borderRadius: '6px', 
                            backgroundColor: importStatus.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            border: `1px solid ${importStatus.type === 'success' ? '#22c55e' : '#ef4444'}`,
                            color: importStatus.type === 'success' ? '#4ade80' : '#f87171',
                            fontSize: '0.85rem'
                        }}>
                            {importStatus.message}
                            {importStatus.type === 'success' && (
                                <button 
                                    onClick={() => window.location.reload()} 
                                    style={{ marginLeft: '12px', background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontWeight: 600 }}
                                >
                                    Reload Now
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="admin-section" style={{ borderTop: '1px solid var(--border-color)', marginTop: '32px', paddingTop: '24px' }}>
                    <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ opacity: 0.7 }}>🛠️</span> Maintenance
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div className="admin-card" style={{ padding: '16px', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                            <h5 style={{ fontWeight: 600, marginBottom: '8px', color: '#fca5a5' }}>Reset Analytics Context</h5>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                                Clears the "analyzed" flag for all content AND deletes all pending AI proposals. 
                                Forces a complete re-analysis of your content.
                            </p>
                            <button 
                                className="btn-secondary" 
                                style={{ borderColor: '#ef4444', color: '#ef4444', width: '100%' }}
                                onClick={async () => {
                                    if (confirm('Are you sure you want to reset all framework analysis? This will delete all pending suggestions and allow you to re-analyze everything from scratch.')) {
                                        try {
                                            const res = await fetch('http://127.0.0.1:8000/api/admin/reset-framework-analysis', { method: 'POST' });
                                            const data = await res.json();
                                            alert(`Success: Reset flags for ${data.reset_count} items and cleared pending queue.`);
                                        } catch (err) {
                                            alert('Failed to reset analysis flags.');
                                        }
                                    }
                                }}
                            >
                                Reset Analysis Flags
                            </button>
                        </div>

                        <div className="admin-card" style={{ padding: '16px', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                            <h5 style={{ fontWeight: 600, marginBottom: '8px', color: '#fca5a5' }}>Wipe Framework Rules</h5>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                                DANGEROUS: Deletes all Global Core rules, all Persona rules, and all proposals. 
                                Resets your practice intelligence to zero.
                            </p>
                            <button 
                                className="btn-secondary" 
                                style={{ borderColor: '#ef4444', color: '#ef4444', width: '100%' }}
                                onClick={async () => {
                                    if (confirm('CRITICAL: This will PERMANENTLY DELETE all your framework rules and proposals. This cannot be undone. Are you absolutely sure?')) {
                                        try {
                                            const res = await fetch('http://127.0.0.1:8000/api/admin/wipe-framework', { method: 'POST' });
                                            const data = await res.json();
                                            alert(`Success: Wiped ${data.deleted_items} rules and ${data.deleted_proposals} proposals.`);
                                        } catch (err) {
                                            alert('Failed to wipe framework.');
                                        }
                                    }
                                }}
                            >
                                Wipe All Rules & Proposals
                            </button>
                        </div>
                    </div>
                </div>

                <div className="admin-section" style={{ borderTop: '1px solid var(--border-color)', marginTop: '32px', paddingTop: '24px' }}>
                    <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px', opacity: 0.5 }}>
                        Future Settings
                    </h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        Additional configuration options like LLM settings, theme customization, and plugin management will appear here in future updates.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;
