import { WebPlugin } from '@capacitor/core';
import type { BetterCrewlinkNativeServicePlugin } from './definitions';
export declare class BetterCrewlinkNativeServiceWeb extends WebPlugin implements BetterCrewlinkNativeServicePlugin {
    disconnect(): Promise<{
        value: string;
    }>;
    showTalking({ color, talking }: {
        color: number;
        talking: boolean;
    }): Promise<{
        value: string;
    }>;
    showNotification(_options: {
        audiomuted: boolean;
        micmuted: boolean;
        overlayEnabled: boolean;
    }): Promise<{
        value: string;
    }>;
    echo(options: {
        value: string;
    }): Promise<{
        value: string;
    }>;
}
