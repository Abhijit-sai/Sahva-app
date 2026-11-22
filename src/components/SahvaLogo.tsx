import BrandImage from "./BrandImage";
export default function SahvaLogo({ compact = false }: { compact?: boolean }) {
  const size = compact ? "h-8 w-auto" : "h-14 w-auto";
  return (
    <span role="img" aria-label="Sahva" className="inline-flex align-middle">
      <BrandImage
        alt=""
        variant="light"
        className={size + (compact ? " dark:hidden" : "")}
      />
      {compact && (
        <BrandImage
          alt=""
          variant="dark"
          className={size + " hidden dark:block"}
        />
      )}
    </span>
  );
}
