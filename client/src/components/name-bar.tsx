import { useEffect, useRef, useState } from "react";

interface NameBarProps {
  name: string;
  className?: string;
}

export function NameBar({ name, className = "" }: NameBarProps) {
  const [displayMode, setDisplayMode] = useState<"full" | "abbreviated">("full");
  const fullNameRef = useRef<HTMLDivElement>(null);
  const abbreviatedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkOverflow = () => {
      if (!fullNameRef.current) return;

      // Check if full name overflows
      const element = fullNameRef.current;
      const hasOverflow = element.scrollHeight > element.clientHeight || 
                         element.scrollWidth > element.clientWidth;

      if (hasOverflow) {
        setDisplayMode("abbreviated");
      } else {
        setDisplayMode("full");
      }
    };

    // Check overflow after render
    setTimeout(checkOverflow, 0);
    
    // Re-check on resize
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [name]);

  // Helper to format abbreviated name (First Last → F. Last)
  const getAbbreviatedName = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return fullName;
    
    const firstInitial = parts[0].charAt(0) + ".";
    const lastName = parts.slice(1).join(" "); // Preserve multi-word surnames and suffixes
    return `${firstInitial} ${lastName}`;
  };

  return (
    <div className={`name-bar ${className}`} title={name} aria-label={name}>
      {displayMode === "full" ? (
        <div 
          ref={fullNameRef}
          className="name-bar two-line"
        >
          {name}
        </div>
      ) : (
        <div 
          ref={abbreviatedRef}
          className="name-bar one-line"
        >
          {getAbbreviatedName(name)}
        </div>
      )}
    </div>
  );
}