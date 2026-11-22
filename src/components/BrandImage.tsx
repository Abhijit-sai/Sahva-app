import type { ImgHTMLAttributes } from "react";

const assets = {
  light: ["/brand/sahva-logo-light.png", "/logo/Sahva_logo_Whitebg.svg"],
  dark: ["/brand/sahva-logo-dark.png", "/logo/Sahva_logo_whitetext.svg"],
  mark: ["/logo/Sahva_logo_mark_whitebg.svg", "/logo/sahva-icon-180.png"],
} as const;

export default function BrandImage({
  variant = "light",
  alt = "Sahva",
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { variant?: keyof typeof assets }) {
  const [src, fallback] = assets[variant];
  return (
    <img
      {...props}
      alt={alt}
      src={src}
      onError={(event) => {
        if (event.currentTarget.getAttribute("src") !== fallback)
          event.currentTarget.src = fallback;
      }}
    />
  );
}
