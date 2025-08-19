import { useEffect, useRef } from "react";
import { display, generate } from "facesjs";

interface PlayerFaceProps {
  face?: Record<string, any> | null;
  size?: number;
  className?: string;
}

export function PlayerFace({ face, size = 64, className = "" }: PlayerFaceProps) {
  const faceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (faceRef.current) {
      try {
        // Clear previous face
        faceRef.current.innerHTML = "";
        
        // Generate face - use provided face data or generate random
        const faceData = face ? face as any : generate();
        
        // Display the face
        display(faceRef.current, faceData);
        
        // Wait for DOM update then fix background
        setTimeout(() => {
          const svg = faceRef.current?.querySelector('svg');
          if (svg) {
            // Remove or modify any background elements
            const rects = svg.querySelectorAll('rect');
            rects.forEach(rect => {
              const fill = rect.getAttribute('fill');
              if (fill === '#ffffff' || fill === 'white' || fill === '#fff' || !fill) {
                rect.setAttribute('fill', 'transparent');
                rect.setAttribute('fill-opacity', '0');
              }
            });
            
            // Set SVG background to transparent
            svg.style.background = 'transparent';
            svg.setAttribute('style', (svg.getAttribute('style') || '') + '; background: transparent !important;');
          }
        }, 10);
        
        // Apply size styling and ensure proper viewBox
        const svg = faceRef.current.querySelector('svg');
        if (svg) {
          svg.style.width = `${size}px`;
          svg.style.height = `${size}px`;
          svg.style.maxWidth = '100%';
          svg.style.maxHeight = '100%';
          svg.style.overflow = 'visible';
          svg.style.background = 'transparent';
          
          // Ensure proper viewBox to prevent cutoff
          if (!svg.getAttribute('viewBox')) {
            svg.setAttribute('viewBox', '0 0 400 600');
          }
          svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
          
          // Remove any background rectangles or make them transparent
          const allRects = svg.querySelectorAll('rect');
          allRects.forEach(rect => {
            const fill = rect.getAttribute('fill');
            if (fill === '#ffffff' || fill === 'white' || fill === '#fff' || fill === '#f8f8f8') {
              rect.setAttribute('fill', 'transparent');
              rect.setAttribute('fill-opacity', '0');
              rect.style.display = 'none';
            }
          });
        }
      } catch (error) {
        console.warn('Error displaying player face:', error);
        // Fallback: show generic avatar with transparent background
        faceRef.current.innerHTML = `
          <div style="
            width: ${size}px; 
            height: ${size}px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: ${Math.max(size / 4, 12)}px;
          ">
            ?
          </div>
        `;
      }
    }
  }, [face, size]);

  return (
    <div 
      ref={faceRef} 
      className={`inline-flex items-center justify-center ${className}`}
      style={{ 
        width: size, 
        height: size, 
        minWidth: size, 
        minHeight: size,
        overflow: 'visible',
        background: 'transparent'
      }}
    />
  );
}