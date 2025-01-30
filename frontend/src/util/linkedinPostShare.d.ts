export interface Profile {
    sub: string;
    firstName: {
      localized: {
        en_US: string;
      };
      preferredLocale: {
        country: string;
        language: string;
      };
    };
    localizedFirstName: string;
    headline: {
      localized: {
        en_US: string;
      };
      preferredLocale: {
        country: string;
        language: string;
      };
    };
    localizedHeadline: string;
    vanityName: string;
    id: string;
    lastName: {
      localized: {
        en_US: string;
      };
      preferredLocale: {
        country: string;
        language: string;
      };
    };
    localizedLastName: string;
    profilePicture: {
      displayImage: string;
    };
  }
  
  export type ImageUpload = {
    value: {
      uploadUrlExpiresAt: number;
      uploadUrl: string;
      image: string;
    };
  };
