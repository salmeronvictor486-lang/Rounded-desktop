import { normalizePresentation } from './model.create';
import type { Presentation } from './model';
import { SlideView } from './SlideView';
import './slides.css';

/** Miniatura de la primera diapositiva. */
export default function SlidesPreview({ content }: { content: Presentation }) {
  const pres = normalizePresentation(content);
  const scale = 210 / pres.size.width;
  return (
    <div className="slides-preview">
      <SlideView slide={pres.slides[0]} pres={pres} scale={scale} />
    </div>
  );
}
