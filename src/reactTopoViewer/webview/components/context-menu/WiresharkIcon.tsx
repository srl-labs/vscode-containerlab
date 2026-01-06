/**
 * Wireshark Icon Component
 * SVG icon for Wireshark capture menu items
 */
import React from 'react';

// Import wireshark SVG
import wiresharkSvg from '../../assets/images/wireshark_bold.svg';

interface WiresharkIconProps {
  className?: string;
}

export const WiresharkIcon: React.FC<WiresharkIconProps> = ({ className }) => (
  <img
    src={wiresharkSvg}
    className={className}
    alt="Wireshark"
    style={{
      width: '1em',
      height: '1em',
      filter: 'brightness(0) invert(1)'
    }}
  />
);
