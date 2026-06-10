import { useEffect, useRef } from 'react';
import styles from './ContextMenu.module.css';

interface MenuItem {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  items: MenuItem[];
}

export function ContextMenu({ x, y, onClose, items }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Delay adding click listener to prevent immediate closing when context menu opens
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 10);

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust coordinates if context menu goes out of the screen
  const menuWidth = 180;
  const menuHeight = items.length * 30; // rough estimate
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  const adjustedX = x + menuWidth > screenWidth ? screenWidth - menuWidth - 8 : x;
  const adjustedY = y + menuHeight > screenHeight ? screenHeight - menuHeight - 8 : y;

  const style: React.CSSProperties = {
    top: adjustedY,
    left: adjustedX,
  };

  return (
    <div className={styles.menu} style={style} ref={menuRef}>
      {items.map((item, idx) => {
        if (item.label === '-') {
          return <div key={idx} className={styles.divider} />;
        }
        return (
          <button
            key={idx}
            className={`${styles.item} ${item.danger ? styles.danger : ''}`}
            onClick={() => {
              item.onClick?.();
              onClose();
            }}
            disabled={item.disabled}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
