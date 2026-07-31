export default function CompanyLogo({ className, src, alt = '' }) {
  if (!src) return null;
  return (
    <img
      className={className}
      src={src}
      alt={alt}
      onError={event => {
        event.currentTarget.style.display = 'none';
      }}
    />
  );
}
