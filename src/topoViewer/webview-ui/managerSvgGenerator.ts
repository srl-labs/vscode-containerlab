// managerSvgGenerator.ts

// Import logger for webview
import { log } from '../logging/logger';

/**
 * Supported node types for SVG generation
 */
export type NodeType =
  | "pe"           // Provider Edge Router
  | "dcgw"         // Data Center Gateway
  | "leaf"         // Leaf Node
  | "switch"       // Switch
  | "spine"        // Spine Node
  | "super-spine"  // Super Spine Router
  | "server"       // Server
  | "pon"          // PON
  | "controller"   // Controller
  | "rgw"          // Residential Gateway
  | "ue"           // User Equipment
  | "cloud"        // Cloud
  | "client"       // Client
  | "bridge";      // Bridge

/**
 * Generates an encoded SVG data URI for a given node type and fill color.
 *
 * @param nodeType - The type of network node to generate SVG for
 * @param fillColor - The fill color for the SVG background (e.g., "#FF0000", "blue")
 * @returns Encoded SVG data URI suitable for use as CSS background-image
 */
export function generateEncodedSVG(nodeType: NodeType, fillColor: string): string {
  let svgString = "";

  switch (nodeType) {

    case "pe":  // Provider Edge Router
      svgString = `
                <svg
                        xmlns:xlink="http://www.w3.org/1999/xlink"
                        xmlns="http://www.w3.org/2000/svg"
                        xml:space="preserve"
                        style="enable-background:new 0 0 120 120;"
                        viewBox="0 0 120 120"
                        y="0px"
                        x="0px"
                        id="Layer_1"
                        version="1.1"
                        width="120px"
                        height="120px"
                        fill="none"
                    >
                        <style type="text/css">
                            .st0 { fill: ${fillColor}; }
                            .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                        </style>
                        <rect height="120" width="120" class="st0" />
                        <g>
                            <g>
                                <path d="M71.7,19.7V48h28" class="st1" />
                                <path d="M91.2,38.5l7.5,7.6c1.3,1.3,1.3,3.1,0,4.3L91.1,58" class="st1" />
                            </g>
                            <g>
                                <path d="M20,47.8h28.4v-28" class="st1" />
                                <path d="M38.8,28.3l7.6-7.5c1.3-1.3,3.1-1.3,4.3,0l7.7,7.6" class="st1" />
                            </g>
                            <g>
                                <path d="M48,100.3V72H20" class="st1" />
                                <path d="M28.5,81.5L21,73.9c-1.3-1.3-1.3-3.1,0-4.3l7.6-7.7" class="st1" />
                            </g>
                            <g>
                                <path d="M100,71.9H71.6v28" class="st1" />
                                <path d="M81.2,91.4l-7.6,7.5c-1.3,1.3-3.1,1.3-4.3,0l-7.7-7.6" class="st1" />
                            </g>
                        </g>
                    </svg>`;
      break;

    case "dcgw":  // Data Center Gateway
      svgString = `
                <svg
                    xmlns:xlink="http://www.w3.org/1999/xlink"
                    xmlns="http://www.w3.org/2000/svg"
                    xml:space="preserve"
                    style="enable-background:new 0 0 120 120;"
                    viewBox="0 0 120 120"
                    y="0px"
                    x="0px"
                    id="Layer_1"
                    version="1.1"
                    width="120px"
                    height="120px"
                    fill="none"
                >
                    <style type="text/css">
                        .st0 { fill: ${fillColor}; }
                        .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                    </style>
                    <rect height="120" width="120" class="st0" />
                    <g>
                        <g>
                            <path d="M93.8,39.8h-10.7c-1.8,0-3-1.3-3.1-3.1V25.9" class="st1" />
                            <path d="M99,21.2L83,37.3" class="st1" />
                        </g>
                        <g>
                            <path d="M19.9,33.9V23.2c0-1.8,1.3-3,3.1-3.1h10.8" class="st1" />
                            <path d="M38.9,39L22.8,22.9" class="st1" />
                        </g>
                        <g>
                            <path d="M24.9,80.9h10.7c1.8,0,3,1.3,3.1,3.1v10.8" class="st1" />
                            <path d="M19.9,99.8L36,83.8" class="st1" />
                        </g>
                        <g>
                            <path d="M100,86v10.7c0,1.8-1.3,3-3.1,3.1h-10.8" class="st1" />
                            <path d="M81.1,81L97.1,97" class="st1" />
                        </g>
                        <g>
                            <line x1="100.1" y1="50" x2="20.1" y2="50" class="st1" />
                            <line x1="100.1" y1="60" x2="20.1" y2="60" class="st1" />
                            <line x1="100.1" y1="70" x2="20.1" y2="70" class="st1" />
                        </g>
                    </g>
                </svg>
            `;
      break;

    case "leaf":  // Leaf Node
      svgString = `
                    <svg
                        xmlns:xlink="http://www.w3.org/1999/xlink"
                        xmlns="http://www.w3.org/2000/svg"
                        xml:space="preserve"
                        style="enable-background:new 0 0 120 120;"
                        viewBox="0 0 120 120"
                        y="0px"
                        x="0px"
                        id="Layer_1"
                        version="1.1"
                        width="120px"
                        height="120px"
                        fill="none"
                    >
                        <style type="text/css">
                            .st0 { fill: ${fillColor}; }
                            .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                        </style>
                        <rect height="120" width="120" class="st0" />
                        <g>
                            <g>
                                <path d="M91.5,27.3l7.6,7.6c1.3,1.3,1.3,3.1,0,4.3l-7.6,7.7" class="st1" />
                                <path d="M28.5,46.9l-7.6-7.6c-1.3-1.3-1.3-3.1,0-4.3l7.6-7.7" class="st1" />
                            </g>
                            <g>
                                <path d="M91.5,73.1l7.6,7.6c1.3,1.3,1.3,3.1,0,4.3l-7.6,7.7" class="st1" />
                                <path d="M28.5,92.7l-7.6-7.6c-1.3-1.3-1.3-3.1,0-4.3l7.6-7.7" class="st1" />
                            </g>
                            <g>
                                <path d="M96.6,36.8H67.9l-16,45.9H23.2" class="st1" />
                                <path d="M96.6,82.7H67.9l-16-45.9H23.2" class="st1" />
                            </g>
                        </g>
                    </svg>

                `;
      break;

    case "bridge": // Bridge uses switch icon
    case "switch":  // Switch
      svgString = `
                    <svg
                        xmlns:xlink="http://www.w3.org/1999/xlink"
                        xmlns="http://www.w3.org/2000/svg"
                        xml:space="preserve"
                        style="enable-background:new 0 0 120 120;"
                        viewBox="0 0 120 120"
                        y="0px"
                        x="0px"
                        id="Layer_1"
                        version="1.1"
                        width="120px"
                        height="120px"
                        fill="none"
                    >
                        <style type="text/css">
                            .st0 { fill: ${fillColor}; }
                            .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                        </style>
                        <rect height="120" width="120" class="st0" />
                        <g>
                            <g>
                                <path d="M91.5,27.3l7.6,7.6c1.3,1.3,1.3,3.1,0,4.3l-7.6,7.7" class="st1" />
                                <path d="M28.5,46.9l-7.6-7.6c-1.3-1.3-1.3-3.1,0-4.3l7.6-7.7" class="st1" />
                            </g>
                            <g>
                                <path d="M91.5,73.1l7.6,7.6c1.3,1.3,1.3,3.1,0,4.3l-7.6,7.7" class="st1" />
                                <path d="M28.5,92.7l-7.6-7.6c-1.3-1.3-1.3-3.1,0-4.3l7.6-7.7" class="st1" />
                            </g>
                            <g>
                                <path d="M96.6,36.8H67.9l-16,45.9H23.2" class="st1" />
                                <path d="M96.6,82.7H67.9l-16-45.9H23.2" class="st1" />
                            </g>
                        </g>
                    </svg>

                `;
      break;

    case "spine":  // Spine Node
      svgString = `
                    <svg
                        xmlns:xlink="http://www.w3.org/1999/xlink"
                        xmlns="http://www.w3.org/2000/svg"
                        xml:space="preserve"
                        style="enable-background:new 0 0 120 120;"
                        viewBox="0 0 120 120"
                        y="0px"
                        x="0px"
                        id="Layer_1"
                        version="1.1"
                        width="120px"
                        height="120px"
                        fill="none"
                    >
                        <style type="text/css">
                            .st0 { fill: ${fillColor}; }
                            .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                        </style>
                        <rect height="120" width="120" class="st0" />
                        <g>
                            <g>
                                <path d="M98,30.1H68L52,89.9H22" class="st1" />
                                <path d="M28,100l-7-8.1c-1.3-1.3-1.3-3.1,0-4.3l7-7.6" class="st1" />
                                <path d="M92,20l7,8.1c1.3,1.3,1.3,3.1,0,4.3L92,40" class="st1" />
                            </g>
                            <g>
                                <path d="M98,89.9H64" class="st1" />
                                <path d="M92,80l7,7.6c1.3,1.3,1.3,3.1,0,4.3l-7,8.1" class="st1" />
                            </g>
                            <g>
                                <path d="M56,30.1H22" class="st1" />
                                <path d="M28,40l-7-7.6c-1.3-1.3-1.3-3.1,0-4.3l7-8.1" class="st1" />
                            </g>
                            <g>
                                <line x1="100" y1="60" x2="72" y2="60" class="st1" />
                                <line x1="20" y1="60" x2="48" y2="60" class="st1" />
                            </g>
                        </g>
                    </svg>
                `;
      break;

    case "super-spine":  // Super Spine Router
      svgString = `
                        <svg
                            xmlns:xlink="http://www.w3.org/1999/xlink"
                            xmlns="http://www.w3.org/2000/svg"
                            xml:space="preserve"
                            style="enable-background:new 0 0 120 120;"
                            viewBox="0 0 120 120"
                            y="0px"
                            x="0px"
                            id="Layer_1"
                            version="1.1"
                            width="120px"
                            height="120px"
                            fill="none"
                        >
                            <style type="text/css">
                                .st0 { fill: ${fillColor}; }
                                .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                            </style>
                            <rect height="120" width="120" class="st0" />
                            <g>
                                <g>
                                    <path d="M98,30.1H68L52,89.9H22" class="st1" />
                                    <path d="M28,100l-7-8.1c-1.3-1.3-1.3-3.1,0-4.3l7-7.6" class="st1" />
                                    <path d="M92,20l7,8.1c1.3,1.3,1.3,3.1,0,4.3L92,40" class="st1" />
                                </g>
                                <g>
                                    <path d="M98,89.9H64" class="st1" />
                                    <path d="M92,80l7,7.6c1.3,1.3,1.3,3.1,0,4.3l-7,8.1" class="st1" />
                                </g>
                                <g>
                                    <path d="M56,30.1H22" class="st1" />
                                    <path d="M28,40l-7-7.6c-1.3-1.3-1.3-3.1,0-4.3l7-8.1" class="st1" />
                                </g>
                                <g>
                                    <line x1="100" y1="60" x2="72" y2="60" class="st1" />
                                    <line x1="20" y1="60" x2="48" y2="60" class="st1" />
                                </g>
                            </g>
                        </svg>
                    `;
      break;

    case "server":  // Server
      svgString = `
                        <svg
                            xmlns:xlink="http://www.w3.org/1999/xlink"
                            xmlns="http://www.w3.org/2000/svg"
                            xml:space="preserve"
                            style="enable-background:new 0 0 120 120;"
                            viewBox="0 0 120 120"
                            y="0px"
                            x="0px"
                            id="Layer_1"
                            version="1.1"
                            width="120px"
                            height="120px"
                            fill="none"
                        >
                            <style type="text/css">
                                .st0 { fill: ${fillColor}; }
                                .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                            </style>
                            <rect height="120" width="120" class="st0" />
                            <g>
                                <path d="M84.9,95H35.1c-1.1,0-2-0.9-2-2V27c0-1.1,0.9-2,2-2h49.7c1.1,0,2,0.9,2,2V93C86.9,94.1,86,95,84.9,95z" class="st1" />
                                <line x1="35.1" y1="41.3" x2="78.7" y2="41.3" class="st1" />
                                <line x1="35.1" y1="78.7" x2="78.7" y2="78.7" class="st1" />
                                <line x1="35.1" y1="66.2" x2="78.7" y2="66.2" class="st1" />
                                <line x1="35.1" y1="53.8" x2="78.7" y2="53.8" class="st1" />
                            </g>
                        </svg>

                    `;
      break;

    case "pon":  // PON
      svgString = `
                        <svg
                            xmlns:xlink="http://www.w3.org/1999/xlink"
                            xmlns="http://www.w3.org/2000/svg"
                            xml:space="preserve"
                            style="enable-background:new 0 0 120 120;"
                            viewBox="0 0 120 120"
                            y="0px"
                            x="0px"
                            id="Layer_1"
                            version="1.1"
                            width="120px"
                            height="120px"
                            fill="none"
                        >
                            <style type="text/css">
                                .st0 { fill: ${fillColor}; }
                                .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                                .st2 { fill: #FFFFFF; stroke: #FFFFFF; stroke-width: 4; stroke-miterlimit: 10; }
                            </style>
                            <rect height="120" width="120" class="st0" />
                            <g>
                                <polyline points="20.9,20 97,60 20.9,100" class="st1" />
                                <line x1="20.9" y1="60" x2="73.8" y2="60" class="st1" />
                                <circle cx="95.1" cy="60" r="3" class="st2" />
                            </g>
                        </svg>


                    `;
      break;

    case "controller":  // Controller
      svgString = `
                        <svg
                            xmlns:xlink="http://www.w3.org/1999/xlink"
                            xmlns="http://www.w3.org/2000/svg"
                            xml:space="preserve"
                            style="enable-background:new 0 0 120 120;"
                            viewBox="0 0 120 120"
                            y="0px"
                            x="0px"
                            id="Layer_1"
                            version="1.1"
                            width="120px"
                            height="120px"
                            fill="none"
                        >
                            <style type="text/css">
                                .st0 { fill: ${fillColor}; }
                                .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                            </style>
                            <rect height="120" width="120" class="st0" />
                            <g>
                                <g>
                                    <path
                                        d="M82.8,60c0,12.6-10.2,22.8-22.8,22.8S37.2,72.6,37.2,60S47.4,37.2,60,37.2c6.3,0,12,2.6,16.2,6.7
                                        C80.2,48.1,82.8,53.8,82.8,60z"
                                        class="st1"
                                    />
                                    <g>
                                        <path d="M92.4,27.8l6.7,7.2c1.2,1.2,1.2,2.9,0,4.1l-6.7,7.7" class="st1" />
                                        <line x1="59.8" y1="37.2" x2="97.9" y2="37.2" class="st1" />
                                    </g>
                                </g>
                                <g>
                                    <path d="M27.6,92.2L20.9,85c-1.2-1.2-1.2-2.9,0-4.1l6.7-7.7" class="st1" />
                                    <line x1="60.2" y1="82.8" x2="22.1" y2="82.8" class="st1" />
                                </g>
                            </g>
                        </svg>

                    `;
      break;

    case "rgw":  // Residential Gateway
      svgString = `
                        <svg
                            xmlns:xlink="http://www.w3.org/1999/xlink"
                            xmlns="http://www.w3.org/2000/svg"
                            xml:space="preserve"
                            style="enable-background:new 0 0 120 120;"
                            viewBox="0 0 120 120"
                            y="0px"
                            x="0px"
                            id="Layer_1"
                            version="1.1"
                            width="120px"
                            height="120px"
                            fill="none"
                        >
                            <style type="text/css">
                                .st0 { fill:  ${fillColor}; }
                                .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                                .st2 { fill: #FFFFFF; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                            </style>
                            <rect height="120" width="120" class="st0" />
                            <path d="M60,74.9c0.8,0,1.5-0.7,1.5-1.5c0-0.8-0.7-1.5-1.5-1.5c-0.8,0-1.5,0.7-1.5,1.5C58.5,74.2,59.2,74.9,60,74.9z" class="st2" />
                            <path d="M46.8,54.6c7.5-7.5,20-7.5,27.5,0" class="st1" />
                            <path d="M53.7,63.9c3.8-3.8,10-3.8,13.8,0" class="st1" />
                            <g>
                                <path d="M17,55.6l37.7-36.5c3.1-3,8.1-3,11.2,0L103,55.7" class="st1" />
                                <path d="M29.9,63.8v31.2c0,4.4,3.6,8,8,8h17.9c2.4,0,4.3-1.9,4.3-4.3v-8.5" class="st1" />
                                <path d="M90.3,63.8v31.2c0,4.4-3.6,8-8,8h-8.5" class="st1" />
                            </g>
                        </svg>
                    `;
      break;

    case "ue":  // User Equipment
      svgString = `
                  <svg
                          xmlns:xlink="http://www.w3.org/1999/xlink"
                          xmlns="http://www.w3.org/2000/svg"
                          xml:space="preserve"
                          style="enable-background:new 0 0 120 120;"
                          viewBox="0 0 120 120"
                          y="0px"
                          x="0px"
                          id="Layer_1"
                          version="1.1"
                          width="120px"
                          height="120px"
                          fill="none"
                      >
                          <style type="text/css">
                              .st0 { fill: ${fillColor}; }
                              .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                          </style>
                          <rect height="120" width="120" class="st0" />
                          <g>
                              <path
                                  class="st1"
                                  d="M54,83.8h11.9 M36.2,28.3c0-3.6,2.4-6.9,6.4-7.8c0.4-0.1,0.9-0.1,1.3-0.1h32.1c0.4,0,0.9,0,1.3,0.1
                                    c3.9,0.9,6.4,4.2,6.4,7.8l0,63.6c0,0.4,0,0.9-0.1,1.3c-0.9,3.9-4.2,6.4-7.8,6.4l-31.9,0c-0.4,0-0.9,0-1.3-0.1
                                    c-3.9-0.9-6.4-4.2-6.4-7.8V28.3z"
                              />
                          </g>
                      </svg>
                    `;
      break;

    case "cloud":  // Cloud
      svgString = `
                    <svg
                        xmlns:xlink="http://www.w3.org/1999/xlink"
                        xmlns="http://www.w3.org/2000/svg"
                        xml:space="preserve"
                        style="enable-background:new 0 0 120 120;"
                        viewBox="0 0 120 120"
                        y="0px"
                        x="0px"
                        id="Layer_1"
                        version="1.1"
                        width="120px"
                        height="120px"
                        fill="none"
                    >
                        <style type="text/css">
                            .st0 { fill: ${fillColor}; }
                            .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                        </style>
                        <rect height="120" width="120" class="st0" />
                        <g>
                            <path
                                class="st1"
                                d="M20,70.9c0.6,8,7.8,14.6,16.2,14.6h42.9c7.1,0,13.9-3.6,17.8-9.5c7.8-11.6,0-28.6-13.9-30.8
                                c-1.9-0.2-3.5-0.2-5.4,0l-2,0.2c-1.5,0.2-3-0.5-3.7-2c-3.2-5.8-9.8-9.6-17.3-8.7c-7.8,0.9-15.1,7.2-15.1,14.9v1.3
                                c0,2-1.7,3.6-3.7,3.6h-0.2C26.7,54.5,19.4,62,20,70.9z"
                            />
                        </g>
                    </svg>
                    `;
      break;

    case "client":  // Client
      svgString = `
                        <svg
                            xmlns:xlink="http://www.w3.org/1999/xlink"
                            xmlns="http://www.w3.org/2000/svg"
                            xml:space="preserve"
                            style="enable-background:new 0 0 120 120;"
                            viewBox="0 0 120 120"
                            y="0px"
                            x="0px"
                            id="Layer_1"
                            version="1.1"
                            width="120px"
                            height="120px"
                            fill="none"
                        >
                            <style type="text/css">
                                .st0 { fill: ${fillColor}; }
                                .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                            </style>
                            <rect height="120" width="120" class="st0" />
                            <g>
                                <path
                                    class="st1"
                                    d="M100,91.1H20H100z M89.1,32.5c0-0.5,0-1-0.2-1.4c-0.2-0.5-0.4-0.9-0.8-1.2
                                    c-0.3-0.3-0.8-0.6-1.2-0.8c-0.5-0.2-0.9-0.2-1.4-0.2H34.6c-0.5,0-1,0-1.4,0.2
                                    c-0.5,0.2-0.9,0.4-1.2,0.8c-0.3,0.3-0.6,0.8-0.8,1.2c-0.2,0.5-0.2,0.9-0.2,1.4V76h58.2V32.5z"
                                />
                            </g>
                        </svg>

                    `;
      break;

    default:
      // For unknown node types, fall back to PE (Provider Edge Router) SVG
      log.warn(`Unknown nodeType: ${nodeType}, using default PE SVG`);
      svgString = `
                <svg
                        xmlns:xlink="http://www.w3.org/1999/xlink"
                        xmlns="http://www.w3.org/2000/svg"
                        xml:space="preserve"
                        style="enable-background:new 0 0 120 120;"
                        viewBox="0 0 120 120"
                        y="0px"
                        x="0px"
                        id="Layer_1"
                        version="1.1"
                        width="120px"
                        height="120px"
                        fill="none"
                    >
                        <style type="text/css">
                            .st0 { fill: ${fillColor}; }
                            .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                        </style>
                        <rect height="120" width="120" class="st0" />
                        <g>
                            <g>
                                <path d="M71.7,19.7V48h28" class="st1" />
                                <path d="M91.2,38.5l7.5,7.6c1.3,1.3,1.3,3.1,0,4.3L91.1,58" class="st1" />
                            </g>
                            <g>
                                <path d="M20,47.8h28.4v-28" class="st1" />
                                <path d="M38.8,28.3l7.6-7.5c1.3-1.3,3.1-1.3,4.3,0l7.7,7.6" class="st1" />
                            </g>
                            <g>
                                <path d="M48,100.3V72H20" class="st1" />
                                <path d="M28.5,81.5L21,73.9c-1.3-1.3-1.3-3.1,0-4.3l7.6-7.7" class="st1" />
                            </g>
                            <g>
                                <path d="M100,71.9H71.6v28" class="st1" />
                                <path d="M81.2,91.4l-7.6,7.5c-1.3,1.3-3.1,1.3-4.3,0l-7.7-7.6" class="st1" />
                            </g>
                        </g>
                    </svg>`;
  }

  // Encode the final selected SVG for Cytoscape.js
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svgString);
}
