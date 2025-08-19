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
        
        // Apply size styling
        const svg = faceRef.current.querySelector('svg');
        if (svg) {
          svg.style.width = `${size}px`;
          svg.style.height = `${size}px`;
          svg.style.maxWidth = '100%';
          svg.style.maxHeight = '100%';
        }
      } catch (error) {
        console.warn('Error displaying player face:', error);
        // Fallback: show generic avatar
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
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
    />
  );
}