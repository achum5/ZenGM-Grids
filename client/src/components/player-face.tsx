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
        
        // Create a temporary container to render face
        const tempDiv = document.createElement('div');
        display(tempDiv, faceData);
        
        // Extract SVG and clean it
        const originalSvg = tempDiv.querySelector('svg');
        if (originalSvg) {
          // Clone the SVG
          const cleanSvg = originalSvg.cloneNode(true) as SVGElement;
          
          // Remove all background rectangles
          const allRects = cleanSvg.querySelectorAll('rect');
          allRects.forEach(rect => {
            const fill = rect.getAttribute('fill');
            const style = rect.getAttribute('style') || '';
            
            // Remove any white or light backgrounds
            if (fill === '#ffffff' || fill === 'white' || fill === '#fff' || 
                fill === '#f8f8f8' || fill === '#fefefe' || !fill ||
                style.includes('fill:#ffffff') || style.includes('fill:white') ||
                style.includes('fill:#fff') || style.includes('fill:#f8f8f8')) {
              rect.remove();
            }
          });
          
          // Remove any background paths or circles that might be white
          const allPaths = cleanSvg.querySelectorAll('path, circle, ellipse');
          allPaths.forEach(element => {
            const fill = element.getAttribute('fill');
            const style = element.getAttribute('style') || '';
            
            if (fill === '#ffffff' || fill === 'white' || fill === '#fff' || 
                fill === '#f8f8f8' || fill === '#fefefe' ||
                style.includes('fill:#ffffff') || style.includes('fill:white')) {
              element.remove();
            }
          });
          
          // Add cleaned SVG to container
          faceRef.current.appendChild(cleanSvg);
        }
        
        // Apply size styling to the cleaned SVG
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