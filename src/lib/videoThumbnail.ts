/**
 * Generates a thumbnail image from a video file by capturing a frame.
 * Returns null on any failure (never throws) to ensure upload doesn't break.
 * 
 * @param videoFile - The video file to generate a thumbnail from
 * @param timeInSeconds - The time position to capture (default: 1 second)
 * @returns Promise resolving to a Blob of the thumbnail image (JPEG) or null on failure
 */
export async function generateVideoThumbnail(
  videoFile: File,
  timeInSeconds: number = 1.0
): Promise<Blob | null> {
  console.log('[Thumbnail] Starting generation for:', videoFile.name, 'size:', videoFile.size);
  
  return new Promise((resolve) => {
    let resolved = false;
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    
    const cleanup = () => {
      if (video.src) {
        URL.revokeObjectURL(video.src);
      }
      video.remove();
      canvas.remove();
    };

    const safeResolve = (result: Blob | null) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(result);
      }
    };

    // Timeout - don't hang forever
    const timeout = setTimeout(() => {
      console.warn('[Thumbnail] Generation timed out after 15s');
      safeResolve(null);
    }, 15000);

    const clearTimeoutAndResolve = (result: Blob | null) => {
      clearTimeout(timeout);
      safeResolve(result);
    };

    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('[Thumbnail] Could not get canvas context');
        clearTimeoutAndResolve(null);
        return;
      }

      // Set up video element
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';

      // Wait for video metadata to load
      video.addEventListener('loadedmetadata', () => {
        console.log('[Thumbnail] Metadata loaded, duration:', video.duration, 'dimensions:', video.videoWidth, 'x', video.videoHeight);
        
        if (!video.duration || video.duration === Infinity || video.videoWidth === 0) {
          console.error('[Thumbnail] Invalid video metadata');
          clearTimeoutAndResolve(null);
          return;
        }
        
        // Seek to desired time (or 10% into video if too short)
        const seekTime = Math.min(timeInSeconds, Math.max(0.1, video.duration * 0.1));
        console.log('[Thumbnail] Seeking to:', seekTime);
        video.currentTime = seekTime;
      });

      video.addEventListener('seeked', () => {
        console.log('[Thumbnail] Seeked, capturing frame...');
        try {
          // Set canvas dimensions (max 640px)
          const maxDimension = 640;
          let width = video.videoWidth;
          let height = video.videoHeight;

          if (width === 0 || height === 0) {
            console.error('[Thumbnail] Video has zero dimensions');
            clearTimeoutAndResolve(null);
            return;
          }

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          canvas.width = width;
          canvas.height = height;
          console.log('[Thumbnail] Canvas size:', width, 'x', height);

          // Draw video frame to canvas
          ctx.drawImage(video, 0, 0, width, height);

          // Convert canvas to blob
          canvas.toBlob(
            (blob) => {
              if (blob && blob.size > 0) {
                console.log('[Thumbnail] Generated successfully, size:', blob.size);
                clearTimeoutAndResolve(blob);
              } else {
                console.error('[Thumbnail] toBlob returned null or empty blob');
                clearTimeoutAndResolve(null);
              }
            },
            'image/jpeg',
            0.85
          );
        } catch (error) {
          console.error('[Thumbnail] Error capturing frame:', error);
          clearTimeoutAndResolve(null);
        }
      }, { once: true });

      video.addEventListener('error', (e) => {
        console.error('[Thumbnail] Video load error:', e);
        clearTimeoutAndResolve(null);
      });

      // Create object URL and start loading
      video.src = URL.createObjectURL(videoFile);
      video.load();
      console.log('[Thumbnail] Loading video...');
      
    } catch (error) {
      console.error('[Thumbnail] Setup error:', error);
      clearTimeout(timeout);
      safeResolve(null);
    }
  });
}
