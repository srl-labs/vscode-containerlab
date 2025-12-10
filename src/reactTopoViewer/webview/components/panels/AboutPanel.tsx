/**
 * AboutPanel - Displays information about TopoViewer
 * Migrated from legacy TopoViewer panel-topoviewer-about.html
 */
import React, { useEffect } from 'react';

interface AboutPanelProps {
  isVisible: boolean;
  onClose: () => void;
}

interface LinkProps {
  href: string;
  children: React.ReactNode;
}

const ExternalLink: React.FC<LinkProps> = ({ href, children }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="about-link font-medium"
  >
    {children}
  </a>
);

export const AboutPanel: React.FC<AboutPanelProps> = ({ isVisible, onClose }) => {
  // Handle Escape key to close panel
  useEffect(() => {
    if (!isVisible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  return (
    <aside
      className="about-panel panel fixed bottom-10 right-10 w-[380px] max-h-[700px] overflow-y-auto z-[21]"
      role="complementary"
      aria-labelledby="about-heading"
    >
      <header className="panel-heading panel-title-bar flex items-center justify-between" id="about-heading">
        <span className="panel-title">About TopoViewer</span>
        <button
          className="panel-close-btn"
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          <i className="fas fa-times" aria-hidden="true"></i>
        </button>
      </header>

      <div className="p-4">
        <article className="max-h-[600px] overflow-y-auto">
          <section className="space-y-4">
            {/* Authors Section */}
            <div>
              <h3 className="text-sm font-semibold mb-2 opacity-80">Authors &amp; Maintainers</h3>
              <div className="text-sm space-y-1.5 pl-2">
                <p className="font-normal">
                  <span className="opacity-60">TopoViewer originally created by </span>
                  <ExternalLink href="https://www.linkedin.com/in/asadarafat/">Asad Arafat</ExternalLink>
                </p>
                <p className="font-normal">
                  <span className="opacity-60">Integrated into VSCode by </span>
                  <ExternalLink href="https://www.linkedin.com/in/asadarafat/">Asad Arafat</ExternalLink>
                  {', '}
                  <ExternalLink href="https://linkedin.com/in/florian-schwarz-812a34145">Florian Schwarz</ExternalLink>
                  {', '}
                  <ExternalLink href="https://linkedin.com/in/kaelem-chandra">Kaelem Chandra</ExternalLink>
                </p>
              </div>
            </div>

            {/* Repositories Section */}
            <div>
              <h3 className="text-sm font-semibold mb-2 opacity-80">Repositories</h3>
              <div className="text-sm space-y-1.5 pl-2">
                <div className="font-normal">
                  <span className="opacity-60">VSCode Extension: </span>
                  <ExternalLink href="https://github.com/srl-labs/vscode-containerlab/">
                    github.com/srl-labs/vscode-containerlab
                  </ExternalLink>
                </div>
                <div className="font-normal">
                  <span className="opacity-60">Original TopoViewer: </span>
                  <ExternalLink href="https://github.com/asadarafat/topoViewer">
                    github.com/asadarafat/topoViewer
                  </ExternalLink>
                </div>
              </div>
            </div>
          </section>
        </article>
      </div>
    </aside>
  );
};
