import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

export const ScienceAnimation = ({purpose}: {purpose: string}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, 90], [0, 1], {extrapolateRight: 'clamp'});
  const prism = purpose.includes('棱镜') || purpose.includes('光谱');
  const atmosphere = purpose.includes('大气') || purpose.includes('地球');
  if (prism)
    return (
      <AbsoluteFill style={{background: '#10142c', overflow: 'hidden'}}>
        <div
          style={{
            position: 'absolute',
            left: '8%',
            top: '48%',
            width: `${34 * progress}%`,
            height: 8,
            background: 'white',
            boxShadow: '0 0 24px white',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '42%',
            top: '30%',
            width: 0,
            height: 0,
            borderLeft: '150px solid transparent',
            borderRight: '150px solid transparent',
            borderBottom: '300px solid #8ee5ff88',
            filter: 'drop-shadow(0 0 24px #7bdcff)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '58%',
            top: '43%',
            width: `${38 * progress}%`,
            height: 150,
            background: 'linear-gradient(9deg,#7248ff,#248cff,#37d974,#ffe45e,#ff8a3d,#ef3c45)',
            clipPath: 'polygon(0 45%,100% 0,100% 100%,0 55%)',
            opacity: 0.9,
          }}
        />
      </AbsoluteFill>
    );
  if (atmosphere)
    return (
      <AbsoluteFill style={{background: '#080d21', overflow: 'hidden'}}>
        <div
          style={{
            position: 'absolute',
            left: -180,
            top: '25%',
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: '#ffd45c',
            boxShadow: '0 0 80px #ffbd3c',
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: -160,
            bottom: -380,
            width: 950,
            height: 950,
            borderRadius: '50%',
            background: '#208ac4',
            boxShadow: '0 0 0 38px #52b7e077,0 0 0 90px #388fd044',
          }}
        />
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${14 + progress * 58}%`,
              top: `${38 + i * 5}%`,
              width: 220,
              height: 3,
              background: i === 2 ? '#45a9ff' : '#fff7c7',
              transform: `rotate(${i * 4 - 5}deg)`,
              boxShadow: i === 2 ? '0 0 16px #45a9ff' : 'none',
            }}
          />
        ))}
      </AbsoluteFill>
    );
  return (
    <AbsoluteFill style={{background: '#0d1022', overflow: 'hidden'}}>
      {Array.from({length: 20}, (_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${10 + (i % 5) * 20}%`,
            top: `${15 + Math.floor(i / 5) * 22}%`,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#b8d5e8',
            boxShadow: '0 0 20px #fff8',
          }}
        />
      ))}
      {Array.from({length: 9}, (_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: '48%',
            top: '48%',
            width: `${10 + progress * (18 + i * 7)}%`,
            height: 4,
            background: i % 3 === 0 ? '#b347ff' : '#318cff',
            transformOrigin: 'left',
            transform: `rotate(${i * 40}deg)`,
            boxShadow: '0 0 12px #4b8cff',
          }}
        />
      ))}
    </AbsoluteFill>
  );
};
