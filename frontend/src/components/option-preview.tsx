import { cn } from "@/lib/utils";

type Props = {
  /** File in public/option-previews, without the extension. */
  name: string;
  /** What the option does, used as the image's accessible description. */
  alt: string;
  className?: string;
};

/**
 * A before/after thumbnail for one option.
 *
 * Split on the diagonal: the upper-left triangle is the option off, the
 * lower-right is on. Generated from the real pipeline by
 * backend/scripts/generate_option_previews.py, so it cannot claim an effect
 * the code does not produce.
 */
export function OptionPreview({ name, alt, className }: Props) {
  return (
    <figure
      className={cn(
        "relative m-0 w-[104px] shrink-0 overflow-hidden rounded-[7px] border border-white/[0.09]",
        className,
      )}
    >
      <img
        src={`/option-previews/${name}.webp`}
        alt={alt}
        loading="lazy"
        width={320}
        height={240}
        className="block h-[78px] w-full object-cover"
      />
      <figcaption className="pointer-events-none absolute inset-0 font-mono text-[8px] uppercase tracking-[0.12em] text-white/70 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
        <span className="absolute left-1 top-1">off</span>
        <span className="absolute bottom-1 right-1">on</span>
      </figcaption>
    </figure>
  );
}
