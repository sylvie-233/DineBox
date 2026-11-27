import type { Dish } from '@dinebox/types';

type GlyphVariant =
  | 'bowl'
  | 'pork'
  | 'lobster'
  | 'leaf'
  | 'dumpling'
  | 'rice'
  | 'noodle'
  | 'soup'
  | 'tea';

function variantOf(dish: Pick<Dish, 'name' | 'categoryName'>): GlyphVariant {
  const text = `${dish.name} ${dish.categoryName ?? ''}`;
  if (/龙虾/.test(text)) return 'lobster';
  if (/水饺|煎饺|饺子/.test(text)) return 'dumpling';
  if (/炒饭|米饭|饭/.test(text)) return 'rice';
  if (/拌面|面/.test(text)) return 'noodle';
  if (/汤/.test(text)) return 'soup';
  if (/茶|饮|柠檬|奶茶/.test(text)) return 'tea';
  if (/木耳|凉菜|菜|沙拉/.test(text)) return 'leaf';
  if (/肉|牛肉|排骨|鸡/.test(text)) return 'pork';
  return 'bowl';
}

/** 菜品占位图：与原型一致的黑白实心矢量图标，未上传图片时使用。 */
export function DishGlyph({
  dish,
  className,
}: {
  dish: Pick<Dish, 'name' | 'categoryName'>;
  className?: string;
}) {
  const variant = variantOf(dish);
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      {variant === 'bowl' && (
        <>
          <g fill="#17181c">
            <circle cx="16" cy="23" r="4" />
            <circle cx="24" cy="21.5" r="4.5" />
            <circle cx="32" cy="23" r="4" />
            <path d="M8 25h32c0 9-7 14-16 14S8 34 8 25z" />
            <rect x="20" y="39" width="8" height="3" rx="1.5" />
          </g>
          <path
            d="M13 30q4-2.6 7.5 0t7.5 0 7.5 0"
            fill="none"
            stroke="#fff"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <g fill="none" stroke="#17181c" strokeWidth="2.4" strokeLinecap="round" opacity=".4">
            <path d="M19 13q3-3 0-6" />
            <path d="M27 13q3-3 0-6" />
          </g>
        </>
      )}
      {variant === 'pork' && (
        <>
          <g fill="#17181c">
            <rect x="9" y="17" width="13" height="13" rx="4" />
            <rect x="24" y="12" width="15" height="15" rx="4.5" />
            <rect x="17" y="26" width="14" height="13" rx="4" />
          </g>
          <g stroke="#fff" strokeWidth="1.6" strokeLinecap="round" fill="none">
            <path d="M13 21h5" />
            <path d="M29 17h5" />
            <path d="M21 31h6" />
          </g>
          <path d="M8 42h32" stroke="#17181c" strokeWidth="2.6" strokeLinecap="round" />
        </>
      )}
      {variant === 'lobster' && (
        <>
          <path
            d="M24 13c-8 0-10 9-9 17 .8 6 5 9 9 9s8.2-3 9-9c1-8-1-17-9-17z"
            fill="#17181c"
          />
          <g stroke="#fff" strokeWidth="1.7" strokeLinecap="round" fill="none">
            <path d="M17.5 22h13" />
            <path d="M17 28h14" />
          </g>
          <g fill="none" stroke="#17181c" strokeWidth="2.2" strokeLinecap="round">
            <path d="M20 12q-4-5-8-6" />
            <path d="M28 12q4-5 8-6" />
          </g>
        </>
      )}
      {variant === 'leaf' && (
        <>
          <path d="M24 40C11 37 8 21 13 11c11-2 23 4 23 15 0 8-6 12-12 14z" fill="#17181c" />
          <path
            d="M24 37c-2-8-2-17-8-24"
            fill="none"
            stroke="#fff"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </>
      )}
      {variant === 'dumpling' && (
        <>
          <path
            d="M10 30c0-12 6-20 14-20s14 8 14 20q0 4-4 4H14q-4 0-4-4z"
            fill="#17181c"
          />
          <g stroke="#fff" strokeWidth="1.7" strokeLinecap="round" fill="none">
            <path d="M16 31q1-10 6-17" />
            <path d="M24 31V12" />
            <path d="M32 31q-1-10-6-17" />
          </g>
          <path d="M10 40h28" stroke="#17181c" strokeWidth="2.6" strokeLinecap="round" />
        </>
      )}
      {variant === 'rice' && (
        <>
          <g fill="#17181c">
            <circle cx="17" cy="22" r="4" />
            <circle cx="24" cy="20" r="4.5" />
            <circle cx="31" cy="22" r="4" />
            <path d="M8 25h32c0 9-7 14-16 14S8 34 8 25z" />
          </g>
          <g fill="#fff">
            <circle cx="19" cy="30" r="1.5" />
            <circle cx="26" cy="29" r="1.5" />
            <circle cx="30" cy="32" r="1.5" />
          </g>
        </>
      )}
      {variant === 'noodle' && (
        <>
          <path d="M8 25h32c0 9-7 14-16 14S8 34 8 25z" fill="#17181c" />
          <path
            d="M13 30q4-2.6 7.5 0t7.5 0"
            fill="none"
            stroke="#fff"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <g fill="none" stroke="#17181c" strokeWidth="2.6" strokeLinecap="round">
            <path d="M26 8l12 8" />
            <path d="M30 4l12 8" />
          </g>
        </>
      )}
      {variant === 'soup' && (
        <>
          <g fill="#17181c">
            <circle cx="17" cy="23" r="4" />
            <circle cx="25" cy="21.5" r="4.5" />
            <circle cx="32" cy="23" r="4" />
            <path d="M8 25h32c0 9-7 14-16 14S8 34 8 25z" />
          </g>
          <g fill="#fff">
            <circle cx="19" cy="29.5" r="2" />
            <circle cx="28" cy="31" r="2" />
            <circle cx="24" cy="27.5" r="2" />
          </g>
          <g fill="none" stroke="#17181c" strokeWidth="2.4" strokeLinecap="round" opacity=".4">
            <path d="M21 12q3-3 0-6" />
            <path d="M29 12q3-3 0-6" />
          </g>
        </>
      )}
      {variant === 'tea' && (
        <>
          <path d="M14 12h20l-3 26H17z" fill="#17181c" />
          <path d="M30 11l7-7" stroke="#17181c" strokeWidth="2.8" strokeLinecap="round" />
          <circle cx="24" cy="24" r="5.5" fill="#fff" />
          <g stroke="#17181c" strokeWidth="1.4" strokeLinecap="round">
            <path d="M24 20.5v7" />
            <path d="M20.8 24h6.4" />
          </g>
        </>
      )}
    </svg>
  );
}

/** 门店 Logo：面条碗图形。 */
export function NoodleLogo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
        <path d="M22 10l14-5M25 14l14-5" />
      </g>
      <path
        d="M10 26h28c0 7-6 11-14 11s-14-4-14-11z"
        fill="currentColor"
      />
    </svg>
  );
}
