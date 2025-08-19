import { useEffect, useRef } from "react";
import { display, generate } from "facesjs";

interface PlayerFaceProps {
  face?: Record<string, any> | null;
  imageUrl?: string | null;
  size?: number;
  className?: string;
}

export function PlayerFace({ face, imageUrl, size = 64, className = "" }: PlayerFaceProps) {
  const faceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (faceRef.current) {
      // Clear previous content
      faceRef.current.innerHTML = "";
      
      // Priority 1: Real player image URL
      if (imageUrl) {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.style.width = `${size}px`;
        img.style.height = `${size}px`;
        img.style.objectFit = 'cover';
        img.style.borderRadius = '50%';
        img.style.background = 'transparent';
        
        img.onload = () => {
          if (faceRef.current) {
            faceRef.current.appendChild(img);
          }
        };
        
        img.onerror = () => {
          // Fallback to faces.js if image fails to load
          generateFacesJSFace();
        };
        
        return;
      }
      
      // Priority 2: faces.js generated face
      generateFacesJSFace();
    }
    
    function generateFacesJSFace() {
      if (!faceRef.current) return;
      
      try {
        // Generate face - use provided face data or generate random
        let faceData = face ? face as any : generate();
        
        // Ensure team colors are properly applied to the face display
        if (faceData && faceData.teamColors && Array.isArray(faceData.teamColors)) {
          console.log('Using team colors from face data:', faceData.teamColors);
        } else {
          console.log('No team colors found in face data, using defaults');
        }
        
        // Display the face with team colors
        display(faceRef.current, faceData);
        
        // Apply size styling and team colors to SVG
        const svg = faceRef.current.querySelector('svg');
        if (svg) {
          svg.style.width = `${size}px`;
          svg.style.height = `${size}px`;
          svg.style.maxWidth = '100%';
          svg.style.maxHeight = '100%';
          svg.style.overflow = 'visible';
          
          // Apply team colors to jersey elements if available
          if (faceData && faceData.teamColors && Array.isArray(faceData.teamColors) && faceData.teamColors.length > 0) {
            const primaryColor = faceData.teamColors[0];
            const secondaryColor = faceData.teamColors[1] || faceData.teamColors[0];
            
            // Find jersey elements and apply team colors
            const jerseyElements = svg.querySelectorAll('[id*="jersey"], [class*="jersey"], g[id*="jersey"] path, g[id*="jersey"] rect');
            jerseyElements.forEach((element, index) => {
              const color = index % 2 === 0 ? primaryColor : secondaryColor;
              element.setAttribute('fill', color);
            });
            
            // Also try to find elements with default jersey colors and replace them
            const defaultJerseyColors = ['#0066cc', '#ff0000', '#0000ff', '#cc0000'];
            defaultJerseyColors.forEach(defaultColor => {
              const coloredElements = svg.querySelectorAll(`[fill="${defaultColor}"]`);
              coloredElements.forEach((element, index) => {
                const color = index % 2 === 0 ? primaryColor : secondaryColor;
                element.setAttribute('fill', color);
              });
            });
          }
          
          // Use CSS to hide white backgrounds without removing elements
          const style = document.createElement('style');
          style.textContent = `
            svg rect[fill="#ffffff"],
            svg rect[fill="white"],
            svg rect[fill="#fff"],
            svg rect[fill="#f8f8f8"] {
              opacity: 0 !important;
              display: none !important;
            }
          `;
          svg.appendChild(style);
          
          // Ensure proper viewBox to prevent cutoff
          if (!svg.getAttribute('viewBox')) {
            svg.setAttribute('viewBox', '0 0 400 600');
          }
          svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        }
      } catch (error) {
        console.warn('Error displaying player face:', error);
        // Fallback: show generic avatar with transparent background
        if (faceRef.current) {
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
    }
  }, [face, imageUrl, size]);

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