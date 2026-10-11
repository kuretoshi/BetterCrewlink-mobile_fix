// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
	production: false,
	// Single source of truth for the app version (also reported in the gameinfo payload).
	// Keep in sync with android/app/build.gradle's versionName when bumping.
	appVersion: '3.14',
	// Desktop TanukiBCL release this build is ported from; exchanged with desktop peers as
	// their `app-version` so version-difference notices compare like with like.
	desktopCompatVersion: '3.2.23',
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/dist/zone-error';  // Included with Angular CLI.
