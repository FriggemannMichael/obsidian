import React from 'react';
import { bodyRegionLabels, type BodyRegionCode } from '@tattoo-studio/contracts';

type Shape = { code: BodyRegionCode } & (
    | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
    | { kind: 'rect'; x: number; y: number; w: number; h: number }
);

export const FRONT_REGIONS: Shape[] = [
    { code: 'front.head', kind: 'ellipse', cx: 110, cy: 46, rx: 24, ry: 31 },
    { code: 'front.neck', kind: 'rect', x: 98, y: 74, w: 24, h: 18 },
    { code: 'front.shoulder.left', kind: 'ellipse', cx: 150, cy: 100, rx: 20, ry: 14 },
    { code: 'front.shoulder.right', kind: 'ellipse', cx: 70, cy: 100, rx: 20, ry: 14 },
    { code: 'front.chest', kind: 'rect', x: 80, y: 92, w: 60, h: 46 },
    { code: 'front.abdomen', kind: 'rect', x: 82, y: 138, w: 56, h: 44 },
    { code: 'front.pelvis', kind: 'rect', x: 84, y: 182, w: 52, h: 34 },
    { code: 'front.upper_arm.left', kind: 'rect', x: 150, y: 100, w: 26, h: 64 },
    { code: 'front.upper_arm.right', kind: 'rect', x: 44, y: 100, w: 26, h: 64 },
    { code: 'front.forearm.left', kind: 'rect', x: 152, y: 164, w: 24, h: 66 },
    { code: 'front.forearm.right', kind: 'rect', x: 44, y: 164, w: 24, h: 66 },
    { code: 'front.hand.left', kind: 'ellipse', cx: 164, cy: 244, rx: 12, ry: 15 },
    { code: 'front.hand.right', kind: 'ellipse', cx: 56, cy: 244, rx: 12, ry: 15 },
    { code: 'front.thigh.left', kind: 'rect', x: 112, y: 216, w: 24, h: 80 },
    { code: 'front.thigh.right', kind: 'rect', x: 84, y: 216, w: 24, h: 80 },
    { code: 'front.lower_leg.left', kind: 'rect', x: 114, y: 296, w: 22, h: 84 },
    { code: 'front.lower_leg.right', kind: 'rect', x: 84, y: 296, w: 22, h: 84 },
    { code: 'front.foot.left', kind: 'ellipse', cx: 125, cy: 392, rx: 13, ry: 10 },
    { code: 'front.foot.right', kind: 'ellipse', cx: 95, cy: 392, rx: 13, ry: 10 },
];

export const BACK_REGIONS: Shape[] = [
    { code: 'back.head', kind: 'ellipse', cx: 110, cy: 46, rx: 24, ry: 31 },
    { code: 'back.neck', kind: 'rect', x: 98, y: 74, w: 24, h: 18 },
    { code: 'back.shoulder_blade.left', kind: 'ellipse', cx: 150, cy: 104, rx: 20, ry: 16 },
    { code: 'back.shoulder_blade.right', kind: 'ellipse', cx: 70, cy: 104, rx: 20, ry: 16 },
    { code: 'back.upper_back', kind: 'rect', x: 80, y: 92, w: 60, h: 48 },
    { code: 'back.lower_back', kind: 'rect', x: 82, y: 140, w: 56, h: 40 },
    { code: 'back.buttocks', kind: 'rect', x: 82, y: 180, w: 56, h: 36 },
    { code: 'back.upper_arm.left', kind: 'rect', x: 150, y: 100, w: 26, h: 64 },
    { code: 'back.upper_arm.right', kind: 'rect', x: 44, y: 100, w: 26, h: 64 },
    { code: 'back.forearm.left', kind: 'rect', x: 152, y: 164, w: 24, h: 66 },
    { code: 'back.forearm.right', kind: 'rect', x: 44, y: 164, w: 24, h: 66 },
    { code: 'back.thigh.left', kind: 'rect', x: 112, y: 216, w: 24, h: 80 },
    { code: 'back.thigh.right', kind: 'rect', x: 84, y: 216, w: 24, h: 80 },
    { code: 'back.calf.left', kind: 'rect', x: 114, y: 296, w: 22, h: 84 },
    { code: 'back.calf.right', kind: 'rect', x: 84, y: 296, w: 22, h: 84 },
];

const SILHOUETTE =
    'M110 10c15 0 26 13 26 30 0 15-8 26-19 32 20 3 33 15 33 34v70c0 12-4 22-10 30 8 40 10 96 6 150-1 12-11 18-21 16-8-2-13-9-13-18-1-40-1-80-4-118-3 38-3 78-4 118 0 9-5 16-13 18-10 2-20-4-21-16-4-54-2-110 6-150-6-8-10-18-10-30v-70c0-19 13-31 33-34-11-6-19-17-19-32 0-17 11-30 26-30z';

export const FigureFrame = ({
    regions,
    selected,
    onToggle,
    interactive,
}: {
    regions: Shape[];
    selected: Set<string>;
    onToggle: (code: BodyRegionCode) => void;
    interactive: boolean;
}) => (
    <svg viewBox="0 0 220 410" className="body-figure" role="img" aria-label="Körperfigur">
        <path d={SILHOUETTE} className="body-figure__silhouette" />
        {regions.map((s) => {
            const common = {
                key: s.code,
                'data-region': s.code,
                'aria-label': bodyRegionLabels[s.code],
                className: `body-figure__region${selected.has(s.code) ? ' is-selected' : ''}`,
                ...(interactive
                    ? {
                          role: 'button' as const,
                          tabIndex: 0,
                          onClick: () => onToggle(s.code),
                          onKeyDown: (e: React.KeyboardEvent) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  onToggle(s.code);
                              }
                          },
                      }
                    : {}),
            };
            return s.kind === 'ellipse' ? (
                <ellipse {...common} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} />
            ) : (
                <rect {...common} x={s.x} y={s.y} width={s.w} height={s.h} rx={8} />
            );
        })}
    </svg>
);
