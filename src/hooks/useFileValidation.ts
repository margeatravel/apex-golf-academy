import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_VIDEO_DURATION = 8; // seconds

// Common image MIME types to accept
const VALID_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/svg+xml',
];

// Common video MIME types
const VALID_VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/mpeg',
  'video/3gpp',
  'video/x-m4v',
];

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export function useFileValidation() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [validating, setValidating] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      
      const objectUrl = URL.createObjectURL(file);
      
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(video.duration);
      };
      
      video.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load video metadata'));
      };
      
      video.src = objectUrl;
    });
  };

  const isValidMediaType = (file: File): boolean => {
    const mimeType = file.type.toLowerCase();
    
    // Accept any image/* or video/* MIME type
    if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) {
      return true;
    }
    
    // If MIME type is empty (some mobile browsers), check extension
    if (!mimeType) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      const validExtensions = [
        'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'bmp', 'tiff', 'svg',
        'mp4', 'mov', 'webm', 'avi', 'mpeg', '3gp', 'm4v'
      ];
      return validExtensions.includes(ext || '');
    }
    
    return false;
  };

  const isVideoFile = (file: File): boolean => {
    if (file.type.startsWith('video/')) {
      return true;
    }
    // Fallback to extension check
    const ext = file.name.split('.').pop()?.toLowerCase();
    return ['mp4', 'mov', 'webm', 'avi', 'mpeg', '3gp', 'm4v'].includes(ext || '');
  };

  const validateFile = useCallback(async (file: File): Promise<ValidationResult> => {
    setValidating(true);
    setFileError(null);

    try {
      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        const error = t('media.fileTooLarge');
        setFileError(error);
        return { isValid: false, error };
      }

      // Check if it's a valid media type
      if (!isValidMediaType(file)) {
        const error = t('media.invalidFileType');
        setFileError(error);
        return { isValid: false, error };
      }

      // If it's a video, check duration
      if (isVideoFile(file)) {
        try {
          const duration = await getVideoDuration(file);
          
          if (duration > MAX_VIDEO_DURATION) {
            const error = t('media.videoTooLongValidation').replace('{n}', String(MAX_VIDEO_DURATION)).replace('{actual}', duration.toFixed(1));
            setFileError(error);
            return { isValid: false, error };
          }
        } catch (err) {
          // If we can't read metadata, allow upload but warn
          console.warn('Could not read video duration:', err);
        }
      }

      setFileError(null);
      return { isValid: true };
    } finally {
      setValidating(false);
    }
  }, [t]);

  const showValidationError = useCallback((error: string) => {
    toast({
      title: t('media.fileValidationErrorTitle'),
      description: error,
      variant: 'destructive',
    });
  }, [toast, t]);

  return {
    validateFile,
    validating,
    fileError,
    setFileError,
    showValidationError,
    MAX_FILE_SIZE,
    MAX_VIDEO_DURATION,
  };
}
