import React, { useState } from 'react';

interface ThumbnailWithFallbackProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  candidates?: string[];
  placeholder?: string;
}

export function ThumbnailWithFallback({
  src,
  candidates = [],
  placeholder = 'https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=200',
  ...props
}: ThumbnailWithFallbackProps) {
  const [currentSrc, setCurrentSrc] = useState(src || candidates[0] || placeholder);
  const [candidateIndex, setCandidateIndex] = useState(0);

  const handleError = () => {
    if (candidateIndex < candidates.length) {
      setCurrentSrc(candidates[candidateIndex]);
      setCandidateIndex(prev => prev + 1);
    } else {
      setCurrentSrc(placeholder);
    }
  };

  return <img src={currentSrc} onError={handleError} {...props} />;
}
