/**
 * TabNavigation - Scrollable tab strip with arrow buttons
 */
import React, { useRef, useState, useCallback, useEffect } from 'react';

export interface TabDefinition {
  id: string;
  label: string;
  hidden?: boolean;
}

interface TabNavigationProps {
  tabs: TabDefinition[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export const TabNavigation: React.FC<TabNavigationProps> = ({ tabs, activeTab, onTabChange }) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollButtons = useCallback(() => {
    if (!viewportRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = viewportRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollButtons();
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.addEventListener('scroll', updateScrollButtons);
    return () => viewport.removeEventListener('scroll', updateScrollButtons);
  }, [updateScrollButtons]);

  const scroll = (direction: 'left' | 'right') => {
    if (!viewportRef.current) return;
    const scrollAmount = 100;
    viewportRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  const visibleTabs = tabs.filter(t => !t.hidden);

  return (
    <div className="panel-tabs panel-tabs--with-arrows">
      <button
        className="tab-scroll-btn"
        onClick={() => scroll('left')}
        disabled={!canScrollLeft}
        aria-label="Scroll tabs left"
        title="Scroll left"
      >
        <i className="fas fa-chevron-left"></i>
      </button>
      <div className="tab-scroll-viewport" ref={viewportRef}>
        <div className="tab-strip">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              className={`panel-tab-button ${activeTab === tab.id ? 'tab-active' : ''}`}
              onClick={() => onTabChange(tab.id)}
              data-tab={tab.id}
              data-testid={`panel-tab-${tab.id}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <button
        className="tab-scroll-btn"
        onClick={() => scroll('right')}
        disabled={!canScrollRight}
        aria-label="Scroll tabs right"
        title="Scroll right"
      >
        <i className="fas fa-chevron-right"></i>
      </button>
    </div>
  );
};
