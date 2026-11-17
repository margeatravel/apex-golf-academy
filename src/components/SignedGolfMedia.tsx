import { ImgHTMLAttributes, VideoHTMLAttributes } from 'react';
import { useSignedGolfMediaUrl } from '@/hooks/useSignedGolfMediaUrl';

type ImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null | undefined;
  fallbackSrc?: string;
};

/** <img> that signs golf-media URLs on the fly. Pass-through for any other URL. */
export function SignedGolfMediaImg({ src, fallbackSrc, ...rest }: ImgProps) {
  const signed = useSignedGolfMediaUrl(src);
  if (!signed && !fallbackSrc) return null;
  return <img src={signed ?? fallbackSrc} {...rest} />;
}

type VideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src' | 'poster'> & {
  src: string | null | undefined;
  poster?: string | null;
};

/** <video> that signs golf-media URLs (and poster) on the fly. */
export function SignedGolfMediaVideo({ src, poster, ...rest }: VideoProps) {
  const signedSrc = useSignedGolfMediaUrl(src);
  const signedPoster = useSignedGolfMediaUrl(poster ?? null);
  return <video src={signedSrc ?? undefined} poster={signedPoster ?? undefined} {...rest} />;
}