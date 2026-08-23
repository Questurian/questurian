import Link from "next/link";

import type {
  AuthorFeatureBlock,
  AuthorFeatureCard,
  FeaturedArticleTeaser,
  HomepageBlockLayoutProps,
} from "../../../types";
import { BlockSection } from "../BlockSection";

function authorImage(card: AuthorFeatureCard, emphasized: boolean) {
  return emphasized
    ? (card.image ?? card.imageSquare ?? card.imageWide)
    : (card.imageSquare ?? card.image ?? card.imageWide);
}

function Linked({
  href,
  className,
  children,
}: {
  href: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <>{children}</>
  );
}

function AuthorCard({
  card,
  style,
  motion,
}: {
  card: AuthorFeatureCard;
  style: AuthorFeatureBlock["imageStyle"];
  motion: AuthorFeatureBlock["motionStyle"];
}) {
  const emphasized = card.isEmphasized;
  const image = authorImage(card, emphasized);
  const href = card.author.href;
  const shape =
    style === "circle"
      ? "rounded-full aspect-square"
      : style === "square"
        ? "aspect-square"
        : emphasized || style === "portrait"
          ? "aspect-[4/5]"
          : "aspect-square";
  const motionClass =
    motion === "subtle"
      ? "transition-transform duration-300 hover:-translate-y-1 focus-visible:-translate-y-1"
      : "";
  const body = (
    <article className={`group relative grid gap-4 ${motionClass}`}>
      <div className={`relative overflow-hidden bg-paper ${shape}`}>
        {image?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.url}
            alt={image.alt ?? ""}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-opacity duration-200 group-hover:opacity-90"
          />
        ) : null}
        <span
          aria-hidden="true"
          className="absolute inset-2 border border-accent/50"
        />
      </div>
      <div className="min-w-0">
        <p className="mb-2 font-sans text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-accent">
          {emphasized ? "Featured Author" : "Author"}
        </p>
        <h3
          className={`${emphasized ? "text-[2.15rem] 768:text-[2.8rem]" : "text-[1.45rem]"} font-display font-medium leading-[0.98] text-foreground`}
        >
          {card.author.name ?? "Author"}
        </h3>
        {card.spotlightNote || card.author.bio ? (
          <p className="mt-4 font-editorial text-[1rem] leading-[1.5] text-foreground/75">
            {card.spotlightNote ?? card.author.bio}
          </p>
        ) : null}
        {card.author.expertise.length ? (
          <p className="mt-3 font-sans text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-foreground/55">
            {card.author.expertise.slice(0, 3).join(" / ")}
          </p>
        ) : null}
      </div>
    </article>
  );
  return href ? (
    <Link
      href={href}
      className="block outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

function RelatedArticle({
  article,
  index,
  count,
}: {
  article: FeaturedArticleTeaser;
  index: number;
  count: number;
}) {
  const showImage = count !== 6;
  const square = count <= 3;
  const image = showImage
    ? square
      ? (article.imageSquare ?? article.image ?? article.imageWide)
      : (article.imageWide ?? article.image ?? article.imageSquare)
    : null;
  const imageColumn =
    count <= 2
      ? "1024:grid-cols-[minmax(120px,48%)_1fr]"
      : "1024:grid-cols-[minmax(96px,38%)_1fr]";
  return (
    <article
      className={`grid min-w-0 gap-3 border-b border-foreground/25 pb-4 last:border-b-0 ${image ? imageColumn : "grid-cols-[2rem_1fr]"}`}
    >
      {image?.url ? (
        <Link
          href={article.articlePath ?? "#"}
          className={`block overflow-hidden bg-paper ${square ? "aspect-square" : "aspect-[16/10]"}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.url}
            alt={image.alt ?? ""}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </Link>
      ) : (
        <span className="pt-0.5 font-sans text-xs font-semibold tabular-nums text-accent">
          {String(index + 1).padStart(2, "0")}
        </span>
      )}
      <div>
        <p className="mb-1 font-sans text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-accent">
          {article.category?.name ?? article.articleType ?? "Article"}
        </p>
        <h3 className="font-editorial text-[1.08rem] font-semibold leading-[1.1] text-foreground">
          {article.articlePath ? (
            <Link href={article.articlePath}>{article.title}</Link>
          ) : (
            article.title
          )}
        </h3>
      </div>
    </article>
  );
}

export function AuthorFeaturePreview({
  block,
}: HomepageBlockLayoutProps<AuthorFeatureBlock>) {
  const emphasized =
    block.authorCards.find((card) => card.isEmphasized) ?? block.authorCards[0];
  const secondary = block.authorCards.filter((card) => card !== emphasized);
  const featureHref = emphasized?.author.href ?? null;
  const portrait = emphasized ? authorImage(emphasized, true) : null;
  const wide = emphasized?.imageWide ?? portrait;
  const imageShape =
    block.imageStyle === "circle"
      ? "flex items-center justify-center"
      : block.imageStyle === "square"
        ? "aspect-square"
        : "aspect-[16/10] 768:aspect-[4/5]";
  const innerShape =
    block.imageStyle === "circle"
      ? "aspect-square w-[82%] overflow-hidden rounded-full"
      : "h-full w-full";

  return (
    <BlockSection
      aria-label={block.sectionHeading ?? "Featured authors"}
      className="bg-background py-8"
    >
      <div className="grid gap-8 768:grid-cols-[minmax(230px,0.82fr)_1.18fr] 768:items-stretch 1024:grid-cols-[minmax(260px,0.9fr)_minmax(280px,0.9fr)_minmax(330px,1.1fr)] 1024:gap-10">
        <div className={`overflow-hidden bg-paper ${imageShape}`}>
          {wide?.url || portrait?.url ? (
            <Linked
              href={featureHref}
              className={`${innerShape} group/image block outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent`}
            >
              <picture className="block h-full w-full">
                {portrait?.url && block.imageStyle !== "square" ? (
                  <source media="(min-width: 768px)" srcSet={portrait.url} />
                ) : null}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={(wide ?? portrait)?.url ?? ""}
                  alt={(wide ?? portrait)?.alt ?? ""}
                  className="h-full w-full object-cover transition-opacity duration-200 group-hover/image:opacity-85"
                />
              </picture>
            </Linked>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col justify-center border-foreground/30 py-8 text-center 768:border-y 768:px-5 1024:border-y-0 1024:px-0">
          {block.sectionHeading ? (
            <p className="mb-4 font-sans text-xs font-semibold uppercase tracking-[0.14em] text-accent">
              <Linked
                href={featureHref}
                className="outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {block.sectionHeading}
              </Linked>
            </p>
          ) : null}
          {emphasized ? (
            <>
              <h2 className="font-display text-[2.65rem] font-medium leading-[0.95] text-foreground 768:text-[3.35rem]">
                <Linked
                  href={featureHref}
                  className="outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {emphasized.author.name ?? "Author"}
                </Linked>
              </h2>
              {emphasized.spotlightNote || emphasized.author.bio ? (
                <p className="mx-auto mt-7 max-w-[38rem] font-editorial text-[1.05rem] leading-[1.55] text-foreground/80">
                  <Linked
                    href={featureHref}
                    className="outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {emphasized.spotlightNote ?? emphasized.author.bio}
                  </Linked>
                </p>
              ) : null}
            </>
          ) : null}
          {block.sectionSubheading ? (
            <p className="mx-auto mt-5 max-w-[36rem] font-sans text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-foreground/55">
              {block.sectionSubheading}
            </p>
          ) : null}
          {secondary.length ? (
            <div className="mt-7 grid gap-4 text-left 640:grid-cols-2 1024:grid-cols-1">
              {secondary.map((card) => (
                <AuthorCard
                  key={card.author.id}
                  card={card}
                  style={block.imageStyle}
                  motion={block.motionStyle}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div
          className={`grid content-start gap-4 border-foreground/70 768:col-span-2 768:grid-cols-2 768:border-t 768:pt-6 1024:col-span-1 1024:grid-cols-1 1024:border-l 1024:border-t-0 1024:pl-6 1024:pt-0 ${block.totalSlots === 6 ? "1280:grid-cols-1" : ""}`}
        >
          {block.items.map((article, index) => (
            <RelatedArticle
              key={`${article.articlePath ?? article.title}:${index}`}
              article={article}
              index={index}
              count={block.totalSlots}
            />
          ))}
        </div>
      </div>
    </BlockSection>
  );
}
