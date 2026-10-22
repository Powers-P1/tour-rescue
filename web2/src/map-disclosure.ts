/** Numbered mobile markers need their city names visible without another tap. */
export function setMapKeyDefaults(container: ParentNode): void {
  const compact = window.matchMedia('(max-width: 1099px)').matches;
  container.querySelectorAll<HTMLDetailsElement>('.germany-map-geo .geo-map-footer .map-reference-details').forEach(details => {
    details.open = compact;
  });
}
