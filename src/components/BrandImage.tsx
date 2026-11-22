import { useState, type ImgHTMLAttributes } from "react";

const assets = {
  light: ["/brand/sahva-logo-light.png", "/logo/Sahva_logo_Whitebg.svg"],
  dark: ["/brand/sahva-logo-dark.png", "/logo/Sahva_logo_whitetext.svg"],
  mark: ["/brand/sahva-mark.png", "/logo/Sahva_logo_mark_whitebg.svg"],
} as const;

export default function BrandImage({
  variant = "light",
  alt = "Sahva",
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { variant?: keyof typeof assets }) {
  const [failed, setFailed] = useState<string[]>([]);
  const src = assets[variant].find((asset) => !failed.includes(asset));
  if (!src)
    return (
      <span className={props.className} aria-label={alt || undefined}>
        {variant === "mark" ? "S" : "Sahva"}
      </span>
    );
  return (
    <img
      {...props}
      alt={alt}
      src={src}
      onError={() => setFailed((previous) => [...previous, src])}
    />
  );
}
