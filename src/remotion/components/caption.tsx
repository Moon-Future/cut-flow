import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {CaptionWord} from '../../core/schema';

type Props = {
  text: string;
  position: 'top' | 'center' | 'bottom';
  animation: 'none' | 'fade';
  fontFamily: string;
  words?: CaptionWord[];
  activeColor: string;
};

const positionStyle = (position: Props['position']): React.CSSProperties => {
  if (position === 'top') return {top: 210};
  if (position === 'center') return {top: '44%', transform: 'translateY(-50%)'};
  return {bottom: 220};
};

export const Caption = ({text, position, animation, fontFamily, words, activeColor}: Props) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const opacity =
    animation === 'fade' ? interpolate(frame, [0, 10], [0, 1], {extrapolateRight: 'clamp'}) : 1;
  return (
    <div
      style={{
        position: 'absolute',
        left: 86,
        right: 86,
        zIndex: 2,
        opacity,
        color: 'white',
        fontFamily: `${fontFamily}, system-ui, sans-serif`,
        fontSize: 68,
        fontWeight: 800,
        lineHeight: 1.25,
        textAlign: 'center',
        WebkitTextStroke: '2px #050812',
        textShadow: '0 5px 18px #000, 0 2px 4px #000',
        ...positionStyle(position),
      }}
    >
      {words?.length
        ? words.map((word, index) => {
            const active = frame / fps >= word.start && frame / fps < word.end;
            return (
              <span
                key={`${word.text}-${index}`}
                style={{
                  color: active ? activeColor : 'white',
                  transform: active ? 'scale(1.08)' : 'scale(1)',
                  display: 'inline-block',
                  marginRight: /[A-Za-z0-9]$/.test(word.text) ? 12 : 2,
                }}
              >
                {word.text}
              </span>
            );
          })
        : text}
    </div>
  );
};
