import React from 'react';
import { useMap } from '@vis.gl/react-google-maps';

interface MapMarkerProps {
  position: { lat: number; lng: number };
  color: string;
  number: number;
  onClick: () => void;
}

export const MapMarker: React.FC<MapMarkerProps> = ({ position, color, number, onClick }) => {
  const map = useMap();
  const [marker, setMarker] = React.useState<google.maps.Marker | null>(null);

  React.useEffect(() => {
    if (!map || !window.google) return;

    // Create a custom SVG pin
    const pinSvg = `
      <svg width="34" height="42" viewBox="0 0 34 42" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 0C7.61116 0 0 7.61116 0 17C0 29.75 17 42 17 42C17 42 34 29.75 34 17C34 7.61116 26.3888 0 17 0ZM17 23.1875C13.5833 23.1875 10.8125 20.4167 10.8125 17C10.8125 13.5833 13.5833 10.8125 17 10.8125C20.4167 10.8125 23.1875 13.5833 23.1875 17C23.1875 20.4167 20.4167 23.1875 17 23.1875Z" fill="${color}"/>
        <circle cx="17" cy="17" r="7" fill="white" />
      </svg>
    `;

    const m = new google.maps.Marker({
      position,
      map,
      icon: {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(pinSvg)}`,
        scaledSize: new google.maps.Size(34, 42),
        anchor: new google.maps.Point(17, 42),
      },
      title: `Território ${number}`,
      animation: google.maps.Animation.DROP,
    });

    m.addListener('click', onClick);
    setMarker(m);

    return () => {
      m.setMap(null);
      google.maps.event.clearInstanceListeners(m);
    };
  }, [map, position, color, number]);

  return null;
};
