declare namespace NodeJS {
    interface ProcessEnv {
        BUILD_ENV: string;
        BUILD_VERSION: string;

        /* add custom env variables here */
        PUBLIC_BOOKING_API_URL: string;
    }
}
