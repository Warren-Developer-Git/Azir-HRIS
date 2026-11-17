import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const SAFE_AVATAR_URL_REGEX =
  /^(?:$|\/storage\/public\/[a-zA-Z0-9._/-]+|https:\/\/[^\s]+|data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+)$/;

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300_000)
  @Matches(SAFE_AVATAR_URL_REGEX, {
    message: 'avatarUrl must be a valid storage path, https URL, or raster image data URI',
  })
  avatarUrl?: string | null;
}
