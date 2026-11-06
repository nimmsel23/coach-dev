import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import './Modal.css';

function getFocusableElements(container) {
  if (!container) return [];
  const selectors = [
    'a[href]',
    'area[href]',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'button:not([disabled])',
    'iframe',
    'object',
    'embed',
    '[contenteditable]',
    '[tabindex]:not([tabindex="-1"])'
  ];
  return Array.from(container.querySelectorAll(selectors.join(','))).filter(
    (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
  );
}

export default function Modal({
  isOpen,
  onClose,
  labelledBy,
  describedBy,
  children,
  closeOnBackdrop = true,
}) {
  const overlayRef = useRef(null);
  const dialogRef = useRef(null);
  const lastActiveRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    // Save last active element to restore focus on close
    lastActiveRef.current = document.activeElement;

    // Lock body scroll
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus management: move focus into the dialog
    const dialog = dialogRef.current;
    const focusable = getFocusableElements(dialog);
    if (focusable.length) {
      focusable[0].focus();
    } else if (dialog) {
      dialog.setAttribute('tabindex', '-1');
      dialog.focus();
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose && onClose();
        return;
      }

      if (e.key === 'Tab') {
        // Focus trap
        const elems = getFocusableElements(dialog);
        if (elems.length === 0) {
          e.preventDefault();
          return;
        }
        const first = elems[0];
        const last = elems[elems.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // restore focus
      try {
        lastActiveRef.current && lastActiveRef.current.focus && lastActiveRef.current.focus();
      } catch (e) {
        // ignore
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function onOverlayClick(e) {
    if (!closeOnBackdrop) return;
    if (e.target === overlayRef.current) {
      onClose && onClose();
    }
  }

  const modal = (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onMouseDown={onOverlayClick}
      aria-hidden={false}
    >
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        ref={dialogRef}
      >
        <div className="modal-content">{children}</div>
        <button
          className="modal-close"
          aria-label="Close dialog"
          onClick={() => onClose && onClose()}
        >
          ×
        </button>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
