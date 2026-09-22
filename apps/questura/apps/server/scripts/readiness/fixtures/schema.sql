-- Questura schema fixture for the disposable readiness sandbox (surge plan L01).
-- Schema only, plus the payload_migrations ledger. No content, accounts or credentials.
-- Regenerate: pnpm readiness fixture-refresh (see scripts/readiness/bootstrap.ts).

--
-- PostgreSQL database dump
--


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: ag_l4; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ag_l4 AS ENUM (
    'four-across',
    'two-by-two'
);


--
-- Name: enum_accommodations_core_price; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_accommodations_core_price AS ENUM (
    '1',
    '2',
    '3',
    '4'
);


--
-- Name: enum_accommodations_country_code; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_accommodations_country_code AS ENUM (
    '+1',
    '+44',
    '+1-CA',
    '+61',
    '+49',
    '+33',
    '+39',
    '+34',
    '+55',
    '+52',
    '+81',
    '+86',
    '+91',
    '+51',
    '+57',
    '+54',
    '+56',
    '+507'
);


--
-- Name: enum_accommodations_price_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_accommodations_price_level AS ENUM (
    '1',
    '2',
    '3',
    '4'
);


--
-- Name: enum_accommodations_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_accommodations_status AS ENUM (
    'draft',
    'published'
);


--
-- Name: enum_accommodations_the_details_walkability; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_accommodations_the_details_walkability AS ENUM (
    'Walkable Downtown',
    'Transit-Friendly',
    'Car Needed',
    'Secluded'
);


--
-- Name: enum_accommodations_the_experience_gym; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_accommodations_the_experience_gym AS ENUM (
    'None',
    'Basic',
    'Full',
    '24/7'
);


--
-- Name: enum_accommodations_the_experience_jacuzzi; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_accommodations_the_experience_jacuzzi AS ENUM (
    'private',
    'shared',
    'rooftop'
);


--
-- Name: enum_accommodations_the_experience_pool; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_accommodations_the_experience_pool AS ENUM (
    'indoor',
    'outdoor',
    'rooftop',
    'infinity'
);


--
-- Name: enum_accommodations_the_experience_vibe; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_accommodations_the_experience_vibe AS ENUM (
    'Luxury',
    'Social',
    'Quiet',
    'Boutique',
    'Family-Friendly',
    'Business-Friendly'
);


--
-- Name: enum_accommodations_the_experience_workspace; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_accommodations_the_experience_workspace AS ENUM (
    'None',
    'Shared Lounge',
    'Dedicated Desk',
    'Co-working Space'
);


--
-- Name: enum_accommodations_the_stay_parking; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_accommodations_the_stay_parking AS ENUM (
    'onsite',
    'valet',
    'street',
    'garage'
);


--
-- Name: enum_accommodations_the_stay_perfect_for; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_accommodations_the_stay_perfect_for AS ENUM (
    'Solo',
    'Couples',
    'Groups'
);


--
-- Name: enum_accommodations_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_accommodations_type AS ENUM (
    'hotel',
    'hostel',
    'resort',
    'vacation-rental',
    'villa',
    'guesthouse',
    'boutique',
    'budget'
);


--
-- Name: enum_affiliate_products_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_affiliate_products_status AS ENUM (
    'draft',
    'published'
);


--
-- Name: enum_affiliate_products_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_affiliate_products_type AS ENUM (
    'backpack',
    'luggage',
    'carryon',
    'accessory',
    'electronics',
    'clothing',
    'toiletries',
    'cameraGear',
    'outdoorGear',
    'flight',
    'tour',
    'activity',
    'package',
    'service'
);


--
-- Name: enum_article_categories_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_article_categories_status AS ENUM (
    'active',
    'archived'
);


--
-- Name: enum_article_redirects_status_code; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_article_redirects_status_code AS ENUM (
    '301',
    '308'
);


--
-- Name: enum_article_tags_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_article_tags_status AS ENUM (
    'active',
    'archived'
);


--
-- Name: enum_articles_access; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_articles_access AS ENUM (
    'free',
    'member'
);


--
-- Name: enum_articles_blocks_img_trio_format; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_articles_blocks_img_trio_format AS ENUM (
    'square',
    'landscape'
);


--
-- Name: enum_articles_language; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_articles_language AS ENUM (
    'en'
);


--
-- Name: enum_articles_seo_section_robots_follow; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_articles_seo_section_robots_follow AS ENUM (
    'follow',
    'nofollow'
);


--
-- Name: enum_articles_seo_section_robots_index; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_articles_seo_section_robots_index AS ENUM (
    'index',
    'noindex'
);


--
-- Name: enum_articles_seo_section_twitter_card_card; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_articles_seo_section_twitter_card_card AS ENUM (
    'summary',
    'summary_large_image'
);


--
-- Name: enum_articles_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_articles_status AS ENUM (
    'draft',
    'published'
);


--
-- Name: enum_attractions_country_code; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_attractions_country_code AS ENUM (
    '+1',
    '+44',
    '+1-CA',
    '+61',
    '+49',
    '+33',
    '+39',
    '+34',
    '+55',
    '+52',
    '+81',
    '+86',
    '+91',
    '+51',
    '+57',
    '+54',
    '+56',
    '+507'
);


--
-- Name: enum_attractions_price_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_attractions_price_level AS ENUM (
    '1',
    '2',
    '3',
    '4'
);


--
-- Name: enum_attractions_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_attractions_status AS ENUM (
    'draft',
    'published'
);


--
-- Name: enum_attractions_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_attractions_type AS ENUM (
    'museum',
    'gallery',
    'library',
    'cultural-center',
    'park',
    'national-park',
    'botanical-garden',
    'beach',
    'island',
    'viewpoint',
    'waterfall',
    'cave',
    'hot-springs',
    'promenade',
    'walking-trail',
    'bike-trail',
    'hiking-trail',
    'scenic-route',
    'historical-site',
    'archaeological-site',
    'ruins',
    'church',
    'cathedral',
    'temple',
    'landmark',
    'adventure-park',
    'monument',
    'memorial',
    'palace',
    'fortress',
    'bridge',
    'lighthouse',
    'plaza',
    'market',
    'shopping',
    'shopping-center',
    'mall',
    'boardwalk',
    'entertainment',
    'stadium',
    'observatory',
    'zoo',
    'aquarium',
    'theme-park',
    'workshop-class'
);


--
-- Name: enum_authors_article_byline_featured_links; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_authors_article_byline_featured_links AS ENUM (
    'instagram',
    'youtube',
    'website',
    'twitter',
    'facebook',
    'linkedin',
    'reddit',
    'patreon'
);


--
-- Name: enum_bookmarks_target_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_bookmarks_target_type AS ENUM (
    'articles',
    'maps',
    'itineraries'
);


--
-- Name: enum_currencies_latest_usd_rate_provider; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_currencies_latest_usd_rate_provider AS ENUM (
    'exchange-rate-api-open',
    'frankfurter'
);


--
-- Name: enum_currencies_regions; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_currencies_regions AS ENUM (
    'north-america',
    'central-america',
    'south-america',
    'europe',
    'caribbean',
    'global'
);


--
-- Name: enum_currencies_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_currencies_status AS ENUM (
    'active',
    'archived'
);


--
-- Name: enum_dining_country_code; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_dining_country_code AS ENUM (
    '+1',
    '+44',
    '+1-CA',
    '+61',
    '+49',
    '+33',
    '+39',
    '+34',
    '+55',
    '+52',
    '+81',
    '+86',
    '+91',
    '+51',
    '+57',
    '+54',
    '+56',
    '+507'
);


--
-- Name: enum_dining_price_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_dining_price_level AS ENUM (
    '1',
    '2',
    '3',
    '4'
);


--
-- Name: enum_dining_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_dining_status AS ENUM (
    'draft',
    'published'
);


--
-- Name: enum_email_logs_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_email_logs_status AS ENUM (
    'sent',
    'failed'
);


--
-- Name: enum_instagram_posts_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_instagram_posts_status AS ENUM (
    'draft',
    'published'
);


--
-- Name: enum_key_locations_country_code; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_key_locations_country_code AS ENUM (
    '+1',
    '+44',
    '+1-CA',
    '+61',
    '+49',
    '+33',
    '+39',
    '+34',
    '+55',
    '+52',
    '+81',
    '+86',
    '+91',
    '+51',
    '+57',
    '+54',
    '+56',
    '+507'
);


--
-- Name: enum_key_locations_key_location_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_key_locations_key_location_status AS ENUM (
    'active',
    'inactive',
    'temporarily_closed',
    'seasonal'
);


--
-- Name: enum_key_locations_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_key_locations_status AS ENUM (
    'draft',
    'published'
);


--
-- Name: enum_key_locations_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_key_locations_type AS ENUM (
    'airport',
    'bus_stop',
    'currency_exchange',
    'bus_terminal'
);


--
-- Name: enum_listicle_itineraries_access; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_listicle_itineraries_access AS ENUM (
    'free',
    'member'
);


--
-- Name: enum_listicle_itineraries_article_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_listicle_itineraries_article_type AS ENUM (
    'listicle-itinerary'
);


--
-- Name: enum_listicle_itineraries_blocks_itinerary_accommodations_angle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_listicle_itineraries_blocks_itinerary_accommodations_angle AS ENUM (
    'signature-dish',
    'atmosphere',
    'founders-backstory',
    'insider-tip',
    'best-for',
    'whats-different',
    'best-for-night',
    'location-and-setting',
    'view-and-vista',
    'design-and-aesthetic',
    'signature-amenity',
    'food-and-beverage',
    'trip-fit',
    'property-backstory',
    'booking-tip',
    'signature-feature',
    'setting',
    'history-built',
    'visit-time-tip',
    'best-for-visit-type'
);


--
-- Name: enum_listicle_itineraries_blocks_itinerary_attractions_angle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_listicle_itineraries_blocks_itinerary_attractions_angle AS ENUM (
    'signature-dish',
    'atmosphere',
    'founders-backstory',
    'insider-tip',
    'best-for',
    'whats-different',
    'best-for-night',
    'location-and-setting',
    'view-and-vista',
    'design-and-aesthetic',
    'signature-amenity',
    'food-and-beverage',
    'trip-fit',
    'property-backstory',
    'booking-tip',
    'signature-feature',
    'setting',
    'history-built',
    'visit-time-tip',
    'best-for-visit-type'
);


--
-- Name: enum_listicle_itineraries_blocks_itinerary_dining_angle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_listicle_itineraries_blocks_itinerary_dining_angle AS ENUM (
    'signature-dish',
    'atmosphere',
    'founders-backstory',
    'insider-tip',
    'best-for',
    'whats-different',
    'best-for-night',
    'location-and-setting',
    'view-and-vista',
    'design-and-aesthetic',
    'signature-amenity',
    'food-and-beverage',
    'trip-fit',
    'property-backstory',
    'booking-tip',
    'signature-feature',
    'setting',
    'history-built',
    'visit-time-tip',
    'best-for-visit-type'
);


--
-- Name: enum_listicle_itineraries_blocks_itinerary_nightlife_angle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_listicle_itineraries_blocks_itinerary_nightlife_angle AS ENUM (
    'signature-dish',
    'atmosphere',
    'founders-backstory',
    'insider-tip',
    'best-for',
    'whats-different',
    'best-for-night',
    'location-and-setting',
    'view-and-vista',
    'design-and-aesthetic',
    'signature-amenity',
    'food-and-beverage',
    'trip-fit',
    'property-backstory',
    'booking-tip',
    'signature-feature',
    'setting',
    'history-built',
    'visit-time-tip',
    'best-for-visit-type'
);


--
-- Name: enum_listicle_itineraries_blocks_itinerary_where_staying_angle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_listicle_itineraries_blocks_itinerary_where_staying_angle AS ENUM (
    'signature-dish',
    'atmosphere',
    'founders-backstory',
    'insider-tip',
    'best-for',
    'whats-different',
    'best-for-night',
    'location-and-setting',
    'view-and-vista',
    'design-and-aesthetic',
    'signature-amenity',
    'food-and-beverage',
    'trip-fit',
    'property-backstory',
    'booking-tip',
    'signature-feature',
    'setting',
    'history-built',
    'visit-time-tip',
    'best-for-visit-type'
);


--
-- Name: enum_listicle_itineraries_language; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_listicle_itineraries_language AS ENUM (
    'en'
);


--
-- Name: enum_listicle_itineraries_list_tone; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_listicle_itineraries_list_tone AS ENUM (
    'elevated',
    'casual',
    'hidden-gem',
    'family-friendly',
    'date-night',
    'budget'
);


--
-- Name: enum_listicle_itineraries_seo_section_robots_follow; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_listicle_itineraries_seo_section_robots_follow AS ENUM (
    'follow',
    'nofollow'
);


--
-- Name: enum_listicle_itineraries_seo_section_robots_index; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_listicle_itineraries_seo_section_robots_index AS ENUM (
    'index',
    'noindex'
);


--
-- Name: enum_listicle_itineraries_seo_section_twitter_card_card; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_listicle_itineraries_seo_section_twitter_card_card AS ENUM (
    'summary',
    'summary_large_image'
);


--
-- Name: enum_listicle_itineraries_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_listicle_itineraries_status AS ENUM (
    'draft',
    'published'
);


--
-- Name: enum_location_homepages_blocks_author_feature_description_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_location_homepages_blocks_author_feature_description_mode AS ENUM (
    'profile',
    'custom'
);


--
-- Name: enum_location_homepages_blocks_author_feature_expertise_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_location_homepages_blocks_author_feature_expertise_mode AS ENUM (
    'profile',
    'selected'
);


--
-- Name: enum_location_homepages_blocks_author_feature_image_style; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_location_homepages_blocks_author_feature_image_style AS ENUM (
    'circle',
    'square',
    'portrait',
    'mixed'
);


--
-- Name: enum_location_homepages_blocks_author_feature_motion_style; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_location_homepages_blocks_author_feature_motion_style AS ENUM (
    'none',
    'subtle'
);


--
-- Name: enum_locations_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_locations_level AS ENUM (
    'country',
    'city',
    'neighborhood'
);


--
-- Name: enum_media_assets_variant; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_media_assets_variant AS ENUM (
    'thumbnail',
    'square',
    'wide',
    'portrait',
    'hero',
    'open_graph',
    'editorial'
);


--
-- Name: enum_media_sets_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_media_sets_status AS ENUM (
    'empty',
    'partial',
    'usable',
    'complete'
);


--
-- Name: enum_nightlife_country_code; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_nightlife_country_code AS ENUM (
    '+1',
    '+44',
    '+1-CA',
    '+61',
    '+49',
    '+33',
    '+39',
    '+34',
    '+55',
    '+52',
    '+81',
    '+86',
    '+91',
    '+51',
    '+57',
    '+54',
    '+56',
    '+507'
);


--
-- Name: enum_nightlife_price_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_nightlife_price_level AS ENUM (
    '1',
    '2',
    '3',
    '4'
);


--
-- Name: enum_nightlife_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_nightlife_status AS ENUM (
    'draft',
    'published'
);


--
-- Name: enum_nightlife_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_nightlife_type AS ENUM (
    'nightclub',
    'rooftop-bar',
    'lounge',
    'karaoke',
    'live-music-venue',
    'speakeasy',
    'comedy-club',
    'pub'
);


--
-- Name: enum_perfect_for_tags_applicable_types; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_perfect_for_tags_applicable_types AS ENUM (
    'dining',
    'attractions',
    'nightlife',
    'accommodations'
);


--
-- Name: enum_perfect_for_tags_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_perfect_for_tags_category AS ENUM (
    'group-size',
    'occasion',
    'vibe',
    'time-of-day',
    'dietary',
    'activity-level',
    'budget',
    'special-features'
);


--
-- Name: enum_perfect_for_tags_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_perfect_for_tags_status AS ENUM (
    'active',
    'archived'
);


--
-- Name: enum_refresh_jobs_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_refresh_jobs_kind AS ENUM (
    'revalidate',
    'search-index'
);


--
-- Name: enum_refresh_jobs_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_refresh_jobs_status AS ENUM (
    'pending',
    'running',
    'done',
    'failed'
);


--
-- Name: enum_single_type_listicles_access; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_single_type_listicles_access AS ENUM (
    'free',
    'member'
);


--
-- Name: enum_single_type_listicles_article_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_single_type_listicles_article_type AS ENUM (
    'single-type-listicle'
);


--
-- Name: enum_single_type_listicles_blocks_data_accommodations_angle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_single_type_listicles_blocks_data_accommodations_angle AS ENUM (
    'signature-dish',
    'atmosphere',
    'founders-backstory',
    'insider-tip',
    'best-for',
    'whats-different',
    'best-for-night',
    'location-and-setting',
    'view-and-vista',
    'design-and-aesthetic',
    'signature-amenity',
    'food-and-beverage',
    'trip-fit',
    'property-backstory',
    'booking-tip',
    'signature-feature',
    'setting',
    'history-built',
    'visit-time-tip',
    'best-for-visit-type'
);


--
-- Name: enum_single_type_listicles_blocks_data_attractions_angle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_single_type_listicles_blocks_data_attractions_angle AS ENUM (
    'signature-dish',
    'atmosphere',
    'founders-backstory',
    'insider-tip',
    'best-for',
    'whats-different',
    'best-for-night',
    'location-and-setting',
    'view-and-vista',
    'design-and-aesthetic',
    'signature-amenity',
    'food-and-beverage',
    'trip-fit',
    'property-backstory',
    'booking-tip',
    'signature-feature',
    'setting',
    'history-built',
    'visit-time-tip',
    'best-for-visit-type'
);


--
-- Name: enum_single_type_listicles_blocks_data_dining_angle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_single_type_listicles_blocks_data_dining_angle AS ENUM (
    'signature-dish',
    'atmosphere',
    'founders-backstory',
    'insider-tip',
    'best-for',
    'whats-different',
    'best-for-night',
    'location-and-setting',
    'view-and-vista',
    'design-and-aesthetic',
    'signature-amenity',
    'food-and-beverage',
    'trip-fit',
    'property-backstory',
    'booking-tip',
    'signature-feature',
    'setting',
    'history-built',
    'visit-time-tip',
    'best-for-visit-type'
);


--
-- Name: enum_single_type_listicles_blocks_data_nightlife_angle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_single_type_listicles_blocks_data_nightlife_angle AS ENUM (
    'signature-dish',
    'atmosphere',
    'founders-backstory',
    'insider-tip',
    'best-for',
    'whats-different',
    'best-for-night',
    'location-and-setting',
    'view-and-vista',
    'design-and-aesthetic',
    'signature-amenity',
    'food-and-beverage',
    'trip-fit',
    'property-backstory',
    'booking-tip',
    'signature-feature',
    'setting',
    'history-built',
    'visit-time-tip',
    'best-for-visit-type'
);


--
-- Name: enum_single_type_listicles_language; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_single_type_listicles_language AS ENUM (
    'en'
);


--
-- Name: enum_single_type_listicles_list_tone; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_single_type_listicles_list_tone AS ENUM (
    'elevated',
    'casual',
    'hidden-gem',
    'family-friendly',
    'date-night',
    'budget'
);


--
-- Name: enum_single_type_listicles_listicle_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_single_type_listicles_listicle_type AS ENUM (
    'dining',
    'accommodations',
    'attractions',
    'nightlife'
);


--
-- Name: enum_single_type_listicles_seo_section_robots_follow; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_single_type_listicles_seo_section_robots_follow AS ENUM (
    'follow',
    'nofollow'
);


--
-- Name: enum_single_type_listicles_seo_section_robots_index; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_single_type_listicles_seo_section_robots_index AS ENUM (
    'index',
    'noindex'
);


--
-- Name: enum_single_type_listicles_seo_section_twitter_card_card; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_single_type_listicles_seo_section_twitter_card_card AS ENUM (
    'summary',
    'summary_large_image'
);


--
-- Name: enum_single_type_listicles_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_single_type_listicles_status AS ENUM (
    'draft',
    'published'
);


--
-- Name: enum_tours_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_tours_status AS ENUM (
    'draft',
    'published'
);


--
-- Name: enum_users_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_users_role AS ENUM (
    'admin',
    'editor',
    'writer'
);


--
-- Name: enum_users_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_users_status AS ENUM (
    'active',
    'disabled'
);


--
-- Name: enum_visitor_profiles_subscription_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_visitor_profiles_subscription_status AS ENUM (
    'none',
    'active',
    'cancelled',
    'past_due'
);


--
-- Name: itinerary_moment; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.itinerary_moment AS ENUM (
    'breakfast',
    'coffee',
    'morning-walk',
    'remote-work',
    'coworking-stop',
    'lunch',
    'street-food',
    'sweet-treat',
    'culture',
    'historic-site',
    'museum-visit',
    'landmark',
    'guided-tour',
    'local-market',
    'shopping',
    'outdoor',
    'beach-time',
    'scenic-viewpoint',
    'wellness-break',
    'active-adventure',
    'boat-ride',
    'day-trip',
    'in-transit',
    'sunset',
    'rooftop-stop',
    'dinner',
    'cocktails',
    'drinks',
    'nightlife'
);


--
-- Name: itm_media_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.itm_media_mode AS ENUM (
    'photos',
    'instagram',
    'both'
);


--
-- Name: lg_ma; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.lg_ma AS ENUM (
    'rectangle',
    'square',
    'portrait'
);


--
-- Name: lit_tour_kl_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.lit_tour_kl_source AS ENUM (
    'existing',
    'manual'
);


--
-- Name: lit_tour_price_tier; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.lit_tour_price_tier AS ENUM (
    '1',
    '2',
    '3',
    '4'
);


--
-- Name: s3_lo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.s3_lo AS ENUM (
    'hero-left',
    'featured-center'
);


--
-- Name: s4_lo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.s4_lo AS ENUM (
    'sidebar-stack',
    'one-over-three'
);


--
-- Name: s5_lo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.s5_lo AS ENUM (
    'card-grid',
    'hero-sidebar'
);


--
-- Name: stl_media_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.stl_media_mode AS ENUM (
    'photos',
    'instagram',
    'both'
);


--
-- Name: sync_identity_email_owner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_identity_email_owner() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      identity_kind text := TG_ARGV[0];
      next_email text;
      previous_email text;
    BEGIN
      IF TG_OP = 'DELETE' THEN
        DELETE FROM "identity_email_owners"
        WHERE "owner_kind" = identity_kind
          AND "owner_id" = OLD."id"::text;
        RETURN OLD;
      END IF;

      next_email := LOWER(BTRIM(NEW."email"));

      IF TG_OP = 'UPDATE' THEN
        previous_email := LOWER(BTRIM(OLD."email"));
        IF next_email = previous_email THEN
          RETURN NEW;
        END IF;

        DELETE FROM "identity_email_owners"
        WHERE "owner_kind" = identity_kind
          AND "owner_id" = OLD."id"::text;
      END IF;

      INSERT INTO "identity_email_owners" ("normalized_email", "owner_kind", "owner_id")
      VALUES (next_email, identity_kind, NEW."id"::text);

      RETURN NEW;
    END;
    $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accommodations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accommodations (
    id integer NOT NULL,
    title character varying NOT NULL,
    type public.enum_accommodations_type,
    location character varying NOT NULL,
    location_ref_id integer,
    address character varying,
    country_code public.enum_accommodations_country_code,
    phone_number character varying,
    website character varying,
    latitude numeric,
    longitude numeric,
    created_by_id integer,
    status public.enum_accommodations_status DEFAULT 'draft'::public.enum_accommodations_status,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    price_level public.enum_accommodations_price_level,
    core_name character varying,
    core_price public.enum_accommodations_core_price,
    core_district character varying,
    core_type character varying,
    the_stay_kid_friendly boolean,
    the_stay_ac boolean,
    the_stay_wifi boolean,
    the_stay_extra_guest_fee boolean,
    the_stay_breakfast_served boolean,
    the_experience_workspace public.enum_accommodations_the_experience_workspace,
    the_experience_restaurant boolean,
    the_experience_rooftop_lounge boolean,
    the_experience_gym public.enum_accommodations_the_experience_gym,
    the_details_address character varying,
    the_details_walkability public.enum_accommodations_the_details_walkability,
    the_details_check_in_time character varying,
    the_details_check_out_time character varying,
    the_details_phone character varying,
    the_details_website_url character varying,
    the_details_booking_url character varying,
    the_details_google_maps_url character varying,
    email character varying,
    country_code_iso character varying,
    iana_time_id character varying,
    source_name character varying
);


--
-- Name: accommodations_gallery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accommodations_gallery (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    image_id integer NOT NULL
);


--
-- Name: accommodations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.accommodations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: accommodations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.accommodations_id_seq OWNED BY public.accommodations.id;


--
-- Name: accommodations_instagram_gallery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accommodations_instagram_gallery (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    post_id integer
);


--
-- Name: accommodations_the_experience_jacuzzi; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accommodations_the_experience_jacuzzi (
    "order" integer NOT NULL,
    parent_id integer NOT NULL,
    value public.enum_accommodations_the_experience_jacuzzi,
    id integer NOT NULL
);


--
-- Name: accommodations_the_experience_jacuzzi_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.accommodations_the_experience_jacuzzi_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: accommodations_the_experience_jacuzzi_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.accommodations_the_experience_jacuzzi_id_seq OWNED BY public.accommodations_the_experience_jacuzzi.id;


--
-- Name: accommodations_the_experience_pool; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accommodations_the_experience_pool (
    "order" integer NOT NULL,
    parent_id integer NOT NULL,
    value public.enum_accommodations_the_experience_pool,
    id integer NOT NULL
);


--
-- Name: accommodations_the_experience_pool_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.accommodations_the_experience_pool_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: accommodations_the_experience_pool_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.accommodations_the_experience_pool_id_seq OWNED BY public.accommodations_the_experience_pool.id;


--
-- Name: accommodations_the_experience_vibe; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accommodations_the_experience_vibe (
    "order" integer NOT NULL,
    parent_id integer NOT NULL,
    value public.enum_accommodations_the_experience_vibe,
    id integer NOT NULL
);


--
-- Name: accommodations_the_experience_vibe_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.accommodations_the_experience_vibe_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: accommodations_the_experience_vibe_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.accommodations_the_experience_vibe_id_seq OWNED BY public.accommodations_the_experience_vibe.id;


--
-- Name: accommodations_the_stay_parking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accommodations_the_stay_parking (
    "order" integer NOT NULL,
    parent_id integer NOT NULL,
    value public.enum_accommodations_the_stay_parking,
    id integer NOT NULL
);


--
-- Name: accommodations_the_stay_parking_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.accommodations_the_stay_parking_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: accommodations_the_stay_parking_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.accommodations_the_stay_parking_id_seq OWNED BY public.accommodations_the_stay_parking.id;


--
-- Name: accommodations_the_stay_perfect_for; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accommodations_the_stay_perfect_for (
    "order" integer NOT NULL,
    parent_id integer NOT NULL,
    value public.enum_accommodations_the_stay_perfect_for,
    id integer NOT NULL
);


--
-- Name: accommodations_the_stay_perfect_for_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.accommodations_the_stay_perfect_for_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: accommodations_the_stay_perfect_for_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.accommodations_the_stay_perfect_for_id_seq OWNED BY public.accommodations_the_stay_perfect_for.id;


--
-- Name: affiliate_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.affiliate_products (
    id integer NOT NULL,
    title character varying NOT NULL,
    type public.enum_affiliate_products_type,
    featured_image_id integer,
    status public.enum_affiliate_products_status DEFAULT 'draft'::public.enum_affiliate_products_status,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_by_id integer
);


--
-- Name: affiliate_products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.affiliate_products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: affiliate_products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.affiliate_products_id_seq OWNED BY public.affiliate_products.id;


--
-- Name: article_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.article_categories (
    id integer NOT NULL,
    name character varying NOT NULL,
    slug character varying,
    description character varying,
    usage_count numeric DEFAULT 0,
    status public.enum_article_categories_status DEFAULT 'active'::public.enum_article_categories_status,
    created_by_id integer,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);


--
-- Name: article_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.article_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: article_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.article_categories_id_seq OWNED BY public.article_categories.id;


--
-- Name: article_redirects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.article_redirects (
    id integer NOT NULL,
    old_path character varying NOT NULL,
    new_path character varying NOT NULL,
    article_id integer,
    status_code public.enum_article_redirects_status_code DEFAULT '301'::public.enum_article_redirects_status_code NOT NULL,
    source character varying DEFAULT 'article-url-change'::character varying,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);


--
-- Name: article_redirects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.article_redirects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: article_redirects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.article_redirects_id_seq OWNED BY public.article_redirects.id;


--
-- Name: article_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.article_tags (
    id integer NOT NULL,
    name character varying NOT NULL,
    slug character varying,
    display_name character varying,
    description character varying,
    usage_count numeric DEFAULT 0,
    status public.enum_article_tags_status DEFAULT 'active'::public.enum_article_tags_status,
    created_by_id integer,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);


--
-- Name: article_tags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.article_tags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: article_tags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.article_tags_id_seq OWNED BY public.article_tags.id;


--
-- Name: articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.articles (
    id integer NOT NULL,
    title character varying NOT NULL,
    slug character varying NOT NULL,
    author_id integer NOT NULL,
    status public.enum_articles_status DEFAULT 'draft'::public.enum_articles_status,
    published_at timestamp(3) with time zone,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    location character varying NOT NULL,
    step1_complete boolean DEFAULT false,
    in_update_mode boolean DEFAULT false,
    step1_ui_wrapper character varying,
    header_section_featured_image_id integer,
    category_id integer,
    location_ref_id integer,
    seo_section_seo_title character varying,
    seo_section_meta_description character varying,
    seo_section_open_graph_title character varying,
    seo_section_open_graph_description character varying,
    seo_section_open_graph_image_url character varying,
    seo_section_open_graph_url character varying,
    seo_section_twitter_card_card public.enum_articles_seo_section_twitter_card_card DEFAULT 'summary'::public.enum_articles_seo_section_twitter_card_card,
    seo_section_twitter_card_title character varying,
    seo_section_twitter_card_description character varying,
    seo_section_twitter_card_image_url character varying,
    seo_section_structured_data jsonb,
    seo_section_robots_index public.enum_articles_seo_section_robots_index DEFAULT 'index'::public.enum_articles_seo_section_robots_index,
    seo_section_robots_follow public.enum_articles_seo_section_robots_follow DEFAULT 'follow'::public.enum_articles_seo_section_robots_follow,
    language public.enum_articles_language DEFAULT 'en'::public.enum_articles_language NOT NULL,
    canonical_path character varying,
    header_section_featured_media_set_id integer,
    source_feature character varying,
    source_run_id character varying,
    access public.enum_articles_access DEFAULT 'free'::public.enum_articles_access NOT NULL
);


--
-- Name: articles_blocks_faq; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.articles_blocks_faq (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    label character varying DEFAULT 'FAQ'::character varying,
    block_name character varying
);


--
-- Name: articles_blocks_faq_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.articles_blocks_faq_items (
    _order integer NOT NULL,
    _parent_id character varying NOT NULL,
    id character varying NOT NULL,
    question character varying,
    answer character varying
);


--
-- Name: articles_blocks_highlight_callout; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.articles_blocks_highlight_callout (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    label character varying DEFAULT 'Highlight Callout'::character varying,
    text character varying,
    block_name character varying
);


--
-- Name: articles_blocks_image; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.articles_blocks_image (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    image_id integer,
    alt_text character varying,
    caption character varying,
    block_name character varying
);


--
-- Name: articles_blocks_img_pair; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.articles_blocks_img_pair (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    image_one_id integer,
    image_two_id integer,
    caption character varying,
    block_name character varying
);


--
-- Name: articles_blocks_img_trio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.articles_blocks_img_trio (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    format public.enum_articles_blocks_img_trio_format DEFAULT 'square'::public.enum_articles_blocks_img_trio_format,
    image_one_id integer,
    image_two_id integer,
    image_three_id integer,
    caption character varying,
    block_name character varying
);


--
-- Name: articles_blocks_in_the_know; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.articles_blocks_in_the_know (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    label character varying DEFAULT 'In The Know'::character varying,
    text character varying,
    block_name character varying
);


--
-- Name: articles_blocks_key_takeaway; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.articles_blocks_key_takeaway (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    label character varying DEFAULT 'Key Takeaways'::character varying,
    block_name character varying
);


--
-- Name: articles_blocks_key_takeaway_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.articles_blocks_key_takeaway_items (
    _order integer NOT NULL,
    _parent_id character varying NOT NULL,
    id character varying NOT NULL,
    text character varying
);


--
-- Name: articles_blocks_pull_quote; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.articles_blocks_pull_quote (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    quote character varying,
    block_name character varying
);


--
-- Name: articles_blocks_text; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.articles_blocks_text (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    content jsonb,
    block_name character varying
);


--
-- Name: articles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.articles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: articles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.articles_id_seq OWNED BY public.articles.id;


--
-- Name: articles_rels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.articles_rels (
    id integer NOT NULL,
    "order" integer,
    parent_id integer NOT NULL,
    path character varying NOT NULL,
    article_tags_id integer,
    locations_id integer
);


--
-- Name: articles_rels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.articles_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: articles_rels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.articles_rels_id_seq OWNED BY public.articles_rels.id;


--
-- Name: attractions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attractions (
    id integer NOT NULL,
    title character varying NOT NULL,
    type public.enum_attractions_type,
    location character varying NOT NULL,
    location_ref_id integer,
    address character varying,
    country_code public.enum_attractions_country_code,
    phone_number character varying,
    website character varying,
    latitude numeric,
    longitude numeric,
    created_by_id integer,
    status public.enum_attractions_status DEFAULT 'draft'::public.enum_attractions_status,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    price_level public.enum_attractions_price_level,
    attractions_details_core_attraction_type character varying,
    attractions_details_core_pricing character varying,
    attractions_details_visit_booking_required boolean,
    email character varying,
    operation_hours jsonb,
    country_code_iso character varying,
    iana_time_id character varying,
    source_name character varying,
    attractions_details_visit_booking_url character varying
);


--
-- Name: attractions_gallery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attractions_gallery (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    image_id integer NOT NULL
);


--
-- Name: attractions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.attractions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: attractions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.attractions_id_seq OWNED BY public.attractions.id;


--
-- Name: attractions_instagram_gallery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attractions_instagram_gallery (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    post_id integer
);


--
-- Name: attractions_rels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attractions_rels (
    id integer NOT NULL,
    "order" integer,
    parent_id integer NOT NULL,
    path character varying NOT NULL,
    tours_id integer
);


--
-- Name: attractions_rels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.attractions_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: attractions_rels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.attractions_rels_id_seq OWNED BY public.attractions_rels.id;


--
-- Name: authors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.authors (
    id integer NOT NULL,
    slug character varying,
    user_id integer,
    display_name character varying NOT NULL,
    avatar_id integer,
    bio character varying,
    social_links_instagram character varying,
    social_links_twitter character varying,
    social_links_facebook character varying,
    social_links_linkedin character varying,
    social_links_reddit character varying,
    social_links_youtube character varying,
    social_links_patreon character varying,
    social_links_website character varying,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    article_byline_show_avatar boolean DEFAULT false
);


--
-- Name: authors_article_byline_featured_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.authors_article_byline_featured_links (
    "order" integer NOT NULL,
    parent_id integer NOT NULL,
    value public.enum_authors_article_byline_featured_links,
    id integer NOT NULL
);


--
-- Name: authors_article_byline_featured_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.authors_article_byline_featured_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: authors_article_byline_featured_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.authors_article_byline_featured_links_id_seq OWNED BY public.authors_article_byline_featured_links.id;


--
-- Name: authors_author_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.authors_author_images (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    media_set_id integer NOT NULL
);


--
-- Name: authors_expertise; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.authors_expertise (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    area character varying NOT NULL
);


--
-- Name: authors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.authors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: authors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.authors_id_seq OWNED BY public.authors.id;


--
-- Name: bookmarks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookmarks (
    id integer NOT NULL,
    auth_user_id character varying NOT NULL,
    target_type public.enum_bookmarks_target_type NOT NULL,
    target_id numeric NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);


--
-- Name: bookmarks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bookmarks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bookmarks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bookmarks_id_seq OWNED BY public.bookmarks.id;


--
-- Name: currencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currencies (
    id integer NOT NULL,
    code character varying NOT NULL,
    name character varying NOT NULL,
    symbol character varying NOT NULL,
    display_symbol character varying,
    default_locale character varying NOT NULL,
    decimal_places numeric DEFAULT 2 NOT NULL,
    notes character varying,
    latest_usd_rate_units_per_usd numeric,
    latest_usd_rate_provider public.enum_currencies_latest_usd_rate_provider,
    latest_usd_rate_provider_date character varying,
    latest_usd_rate_source_updated_at timestamp(3) with time zone,
    latest_usd_rate_next_update_at timestamp(3) with time zone,
    latest_usd_rate_fetched_at timestamp(3) with time zone,
    status public.enum_currencies_status DEFAULT 'active'::public.enum_currencies_status NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);


--
-- Name: currencies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.currencies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: currencies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.currencies_id_seq OWNED BY public.currencies.id;


--
-- Name: currencies_regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currencies_regions (
    "order" integer NOT NULL,
    parent_id integer NOT NULL,
    value public.enum_currencies_regions,
    id integer NOT NULL
);


--
-- Name: currencies_regions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.currencies_regions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: currencies_regions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.currencies_regions_id_seq OWNED BY public.currencies_regions.id;


--
-- Name: currencies_used_in; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currencies_used_in (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    country character varying NOT NULL
);


--
-- Name: dining; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dining (
    id integer NOT NULL,
    title character varying NOT NULL,
    type character varying,
    location character varying,
    location_ref_id integer,
    address character varying,
    country_code public.enum_dining_country_code,
    phone_number character varying,
    website character varying,
    latitude numeric,
    longitude numeric,
    created_by_id integer,
    status public.enum_dining_status DEFAULT 'draft'::public.enum_dining_status,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    price_level public.enum_dining_price_level,
    cuisines jsonb,
    ideal_for jsonb,
    email character varying,
    operation_hours jsonb,
    iana_time_id character varying,
    menu_url character varying,
    booking_url character varying
);


--
-- Name: dining_gallery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dining_gallery (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    image_id integer NOT NULL
);


--
-- Name: dining_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dining_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dining_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dining_id_seq OWNED BY public.dining.id;


--
-- Name: dining_instagram_gallery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dining_instagram_gallery (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    post_id integer
);


--
-- Name: email_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_logs (
    id integer NOT NULL,
    email_type character varying NOT NULL,
    recipient character varying NOT NULL,
    subject character varying,
    status public.enum_email_logs_status NOT NULL,
    error character varying,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_logs_id_seq OWNED BY public.email_logs.id;


--
-- Name: identity_email_owners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.identity_email_owners (
    normalized_email text NOT NULL,
    owner_kind text NOT NULL,
    owner_id text NOT NULL,
    CONSTRAINT identity_email_owners_kind_check CHECK ((owner_kind = ANY (ARRAY['staff'::text, 'visitor'::text]))),
    CONSTRAINT identity_email_owners_normalized_check CHECK ((normalized_email = lower(btrim(normalized_email)))),
    CONSTRAINT identity_email_owners_visitor_staff_domain_check CHECK (((owner_kind <> 'visitor'::text) OR (normalized_email !~~ '%@questurian.com'::text)))
);


--
-- Name: instagram_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_posts (
    id integer NOT NULL,
    title character varying NOT NULL,
    embed_code character varying NOT NULL,
    status public.enum_instagram_posts_status DEFAULT 'draft'::public.enum_instagram_posts_status,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    preview_image_id integer
);


--
-- Name: instagram_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.instagram_posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: instagram_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.instagram_posts_id_seq OWNED BY public.instagram_posts.id;


--
-- Name: ita; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ita (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    title character varying,
    operator character varying,
    price public.lit_tour_price_tier,
    url character varying,
    tour_duration numeric DEFAULT 1,
    image_id integer,
    instagram_post_id integer,
    blurb jsonb,
    block_name character varying,
    starting_point_label character varying,
    starting_point_latitude numeric,
    starting_point_longitude numeric,
    moment public.itinerary_moment,
    moment_label character varying
);


--
-- Name: key_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.key_locations (
    id integer NOT NULL,
    title character varying NOT NULL,
    type public.enum_key_locations_type,
    key_location_status public.enum_key_locations_key_location_status,
    key_locations_details_core_location_type character varying,
    key_locations_details_core_status character varying,
    key_locations_details_core_neighborhood character varying,
    location character varying NOT NULL,
    location_ref_id integer,
    address character varying,
    country_code public.enum_key_locations_country_code,
    phone_number character varying,
    website character varying,
    email character varying,
    operation_hours jsonb,
    country_code_iso character varying,
    iana_time_id character varying,
    source_name character varying,
    latitude numeric,
    longitude numeric,
    created_by_id integer,
    status public.enum_key_locations_status DEFAULT 'draft'::public.enum_key_locations_status,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);


--
-- Name: key_locations_gallery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.key_locations_gallery (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    image_id integer NOT NULL
);


--
-- Name: key_locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.key_locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: key_locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.key_locations_id_seq OWNED BY public.key_locations.id;


--
-- Name: key_locations_instagram_gallery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.key_locations_instagram_gallery (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    post_id integer
);


--
-- Name: kls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kls (
    _order integer NOT NULL,
    _parent_id character varying NOT NULL,
    id character varying NOT NULL,
    source public.lit_tour_kl_source DEFAULT 'existing'::public.lit_tour_kl_source,
    title character varying,
    latitude numeric,
    longitude numeric
);


--
-- Name: listicle_itineraries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listicle_itineraries (
    id integer NOT NULL,
    step1_complete boolean DEFAULT false,
    in_update_mode boolean DEFAULT false,
    slug character varying NOT NULL,
    title character varying NOT NULL,
    location character varying NOT NULL,
    location_ref_id integer,
    header_intro jsonb,
    header_featured_image_id integer,
    status public.enum_listicle_itineraries_status DEFAULT 'draft'::public.enum_listicle_itineraries_status,
    author_id integer NOT NULL,
    published_at timestamp(3) with time zone,
    article_type public.enum_listicle_itineraries_article_type DEFAULT 'listicle-itinerary'::public.enum_listicle_itineraries_article_type NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    seo_section_seo_title character varying,
    seo_section_meta_description character varying,
    seo_section_open_graph_title character varying,
    seo_section_open_graph_description character varying,
    seo_section_open_graph_image_url character varying,
    seo_section_open_graph_url character varying,
    seo_section_twitter_card_card public.enum_listicle_itineraries_seo_section_twitter_card_card DEFAULT 'summary'::public.enum_listicle_itineraries_seo_section_twitter_card_card,
    seo_section_twitter_card_title character varying,
    seo_section_twitter_card_description character varying,
    seo_section_twitter_card_image_url character varying,
    seo_section_structured_data jsonb,
    seo_section_robots_index public.enum_listicle_itineraries_seo_section_robots_index DEFAULT 'index'::public.enum_listicle_itineraries_seo_section_robots_index,
    seo_section_robots_follow public.enum_listicle_itineraries_seo_section_robots_follow DEFAULT 'follow'::public.enum_listicle_itineraries_seo_section_robots_follow,
    day_count numeric DEFAULT 1,
    language public.enum_listicle_itineraries_language DEFAULT 'en'::public.enum_listicle_itineraries_language NOT NULL,
    header_featured_media_set_id integer,
    list_tone public.enum_listicle_itineraries_list_tone DEFAULT 'elevated'::public.enum_listicle_itineraries_list_tone,
    generation_brief character varying,
    plan_overview character varying,
    access public.enum_listicle_itineraries_access DEFAULT 'free'::public.enum_listicle_itineraries_access NOT NULL
);


--
-- Name: listicle_itineraries_blocks_itinerary_accommodations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listicle_itineraries_blocks_itinerary_accommodations (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    item_id integer,
    blurb jsonb,
    block_name character varying,
    media_mode public.itm_media_mode,
    selected_instagram_post_id integer,
    angle public.enum_listicle_itineraries_blocks_itinerary_accommodations_angle,
    selection_reason character varying,
    moment public.itinerary_moment,
    moment_label character varying
);


--
-- Name: listicle_itineraries_blocks_itinerary_attractions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listicle_itineraries_blocks_itinerary_attractions (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    item_id integer,
    blurb jsonb,
    block_name character varying,
    media_mode public.itm_media_mode,
    selected_instagram_post_id integer,
    angle public.enum_listicle_itineraries_blocks_itinerary_attractions_angle,
    selection_reason character varying,
    moment public.itinerary_moment,
    moment_label character varying
);


--
-- Name: listicle_itineraries_blocks_itinerary_dining; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listicle_itineraries_blocks_itinerary_dining (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    item_id integer,
    blurb jsonb,
    block_name character varying,
    media_mode public.itm_media_mode,
    selected_instagram_post_id integer,
    angle public.enum_listicle_itineraries_blocks_itinerary_dining_angle,
    selection_reason character varying,
    moment public.itinerary_moment,
    moment_label character varying
);


--
-- Name: listicle_itineraries_blocks_itinerary_key_location; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listicle_itineraries_blocks_itinerary_key_location (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    item_id integer,
    blurb jsonb,
    block_name character varying,
    media_mode public.itm_media_mode,
    selected_instagram_post_id integer,
    moment public.itinerary_moment,
    moment_label character varying
);


--
-- Name: listicle_itineraries_blocks_itinerary_nightlife; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listicle_itineraries_blocks_itinerary_nightlife (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    item_id integer,
    blurb jsonb,
    block_name character varying,
    media_mode public.itm_media_mode,
    selected_instagram_post_id integer,
    angle public.enum_listicle_itineraries_blocks_itinerary_nightlife_angle,
    selection_reason character varying,
    moment public.itinerary_moment,
    moment_label character varying
);


--
-- Name: listicle_itineraries_blocks_itinerary_where_staying; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listicle_itineraries_blocks_itinerary_where_staying (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    item_id integer,
    media_mode public.itm_media_mode,
    selected_instagram_post_id integer,
    blurb jsonb,
    block_name character varying,
    angle public.enum_listicle_itineraries_blocks_itinerary_where_staying_angle,
    selection_reason character varying
);


--
-- Name: listicle_itineraries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.listicle_itineraries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: listicle_itineraries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.listicle_itineraries_id_seq OWNED BY public.listicle_itineraries.id;


--
-- Name: listicle_itineraries_itinerary_days; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listicle_itineraries_itinerary_days (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL
);


--
-- Name: listicle_itineraries_rels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listicle_itineraries_rels (
    id integer NOT NULL,
    "order" integer,
    parent_id integer NOT NULL,
    path character varying NOT NULL,
    media_sets_id integer,
    locations_id integer,
    dining_id integer,
    accommodations_id integer,
    attractions_id integer,
    nightlife_id integer,
    key_locations_id integer,
    tours_id integer
);


--
-- Name: listicle_itineraries_rels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.listicle_itineraries_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: listicle_itineraries_rels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.listicle_itineraries_rels_id_seq OWNED BY public.listicle_itineraries_rels.id;


--
-- Name: location_homepages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_homepages (
    id integer NOT NULL,
    location_id integer NOT NULL,
    is_enabled boolean DEFAULT false,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    last_published_at timestamp(3) with time zone,
    last_published_by_id integer,
    published_revision numeric DEFAULT 0
);


--
-- Name: location_homepages_blocks_article_grid; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_homepages_blocks_article_grid (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    slot_count numeric NOT NULL,
    block_name character varying,
    section_heading character varying,
    section_subheading character varying,
    article_grid_four_layout public.ag_l4 DEFAULT 'four-across'::public.ag_l4,
    source_block_key character varying
);


--
-- Name: location_homepages_blocks_article_list; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_homepages_blocks_article_list (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    slot_count numeric NOT NULL,
    section_heading character varying,
    section_subheading character varying,
    block_name character varying,
    source_block_key character varying
);


--
-- Name: location_homepages_blocks_author_feature; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_homepages_blocks_author_feature (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    slot_count numeric NOT NULL,
    section_heading character varying,
    section_subheading character varying,
    image_style public.enum_location_homepages_blocks_author_feature_image_style DEFAULT 'portrait'::public.enum_location_homepages_blocks_author_feature_image_style,
    motion_style public.enum_location_homepages_blocks_author_feature_motion_style DEFAULT 'subtle'::public.enum_location_homepages_blocks_author_feature_motion_style,
    source_block_key character varying,
    block_name character varying,
    description_mode public.enum_location_homepages_blocks_author_feature_description_mode DEFAULT 'profile'::public.enum_location_homepages_blocks_author_feature_description_mode,
    expertise_mode public.enum_location_homepages_blocks_author_feature_expertise_mode DEFAULT 'profile'::public.enum_location_homepages_blocks_author_feature_expertise_mode
);


--
-- Name: location_homepages_blocks_author_feature_author_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_homepages_blocks_author_feature_author_cards (
    _order integer NOT NULL,
    _parent_id character varying NOT NULL,
    id character varying NOT NULL,
    author_id integer NOT NULL,
    image_id integer,
    spotlight_note character varying,
    is_emphasized boolean DEFAULT false
);


--
-- Name: location_homepages_blocks_author_feature_selected_expertise; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_homepages_blocks_author_feature_selected_expertise (
    _order integer NOT NULL,
    _parent_id character varying NOT NULL,
    id character varying NOT NULL,
    area character varying NOT NULL
);


--
-- Name: location_homepages_blocks_editorial_feature; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_homepages_blocks_editorial_feature (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    slot_count numeric NOT NULL,
    feature_kicker character varying,
    feature_title character varying,
    feature_description character varying,
    feature_media_set_id integer,
    linked_location_id integer,
    source_block_key character varying,
    block_name character varying
);


--
-- Name: location_homepages_blocks_featured_article; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_homepages_blocks_featured_article (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    slot_count numeric DEFAULT 1 NOT NULL,
    block_name character varying,
    section_heading character varying,
    section_subheading character varying,
    source_block_key character varying
);


--
-- Name: location_homepages_blocks_featured_article_carousel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_homepages_blocks_featured_article_carousel (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    slot_count numeric NOT NULL,
    section_heading character varying,
    section_subheading character varying,
    block_name character varying,
    source_block_key character varying
);


--
-- Name: location_homepages_blocks_featured_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_homepages_blocks_featured_articles (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    block_name character varying,
    slot_count numeric NOT NULL,
    section_heading character varying,
    slot3_layout public.s3_lo DEFAULT 'hero-left'::public.s3_lo,
    slot4_layout public.s4_lo DEFAULT 'sidebar-stack'::public.s4_lo,
    slot5_layout public.s5_lo DEFAULT 'card-grid'::public.s5_lo,
    section_subheading character varying,
    source_block_key character varying
);


--
-- Name: location_homepages_blocks_featured_creator_article; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_homepages_blocks_featured_creator_article (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    slot_count numeric DEFAULT 1 NOT NULL,
    block_name character varying,
    section_heading character varying,
    section_subheading character varying,
    source_block_key character varying,
    creator_kicker character varying
);


--
-- Name: location_homepages_blocks_hotel_grid; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_homepages_blocks_hotel_grid (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    slot_count numeric NOT NULL,
    block_name character varying,
    section_heading character varying,
    section_subheading character varying,
    source_block_key character varying
);


--
-- Name: location_homepages_blocks_location_grid; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_homepages_blocks_location_grid (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    slot_count numeric NOT NULL,
    block_name character varying,
    section_heading character varying,
    section_subheading character varying,
    media_aspect public.lg_ma DEFAULT 'rectangle'::public.lg_ma,
    source_block_key character varying,
    item_descriptions jsonb,
    item_kickers jsonb
);


--
-- Name: location_homepages_blocks_newsletter_signup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_homepages_blocks_newsletter_signup (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    slot_count numeric DEFAULT 0 NOT NULL,
    section_heading character varying,
    section_subheading character varying,
    block_name character varying,
    source_block_key character varying
);


--
-- Name: location_homepages_blocks_questurian_maps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_homepages_blocks_questurian_maps (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    slot_count numeric DEFAULT 6 NOT NULL,
    block_name character varying,
    section_heading character varying,
    section_subheading character varying,
    source_block_key character varying
);


--
-- Name: location_homepages_blocks_things_to_do_attractions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_homepages_blocks_things_to_do_attractions (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    slot_count numeric NOT NULL,
    block_name character varying,
    section_heading character varying,
    section_subheading character varying,
    source_block_key character varying
);


--
-- Name: location_homepages_blocks_things_to_do_listicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_homepages_blocks_things_to_do_listicles (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    slot_count numeric NOT NULL,
    block_name character varying,
    section_heading character varying,
    section_subheading character varying,
    source_block_key character varying
);


--
-- Name: location_homepages_blocks_tour_grid; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_homepages_blocks_tour_grid (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    slot_count numeric NOT NULL,
    section_heading character varying,
    section_subheading character varying,
    block_name character varying,
    source_block_key character varying
);


--
-- Name: location_homepages_blocks_where_to_eat_drink; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_homepages_blocks_where_to_eat_drink (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    slot_count numeric NOT NULL,
    block_name character varying,
    section_heading character varying,
    section_subheading character varying,
    source_block_key character varying
);


--
-- Name: location_homepages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.location_homepages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: location_homepages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.location_homepages_id_seq OWNED BY public.location_homepages.id;


--
-- Name: location_homepages_rels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_homepages_rels (
    id integer NOT NULL,
    "order" integer,
    parent_id integer NOT NULL,
    path character varying NOT NULL,
    articles_id integer,
    single_type_listicles_id integer,
    listicle_itineraries_id integer,
    locations_id integer,
    accommodations_id integer,
    attractions_id integer,
    tours_id integer
);


--
-- Name: location_homepages_rels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.location_homepages_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: location_homepages_rels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.location_homepages_rels_id_seq OWNED BY public.location_homepages_rels.id;


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id integer NOT NULL,
    country character varying NOT NULL,
    city character varying,
    neighborhood character varying,
    location_key character varying,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    level public.enum_locations_level NOT NULL,
    parent_key character varying,
    country_name character varying NOT NULL,
    city_name character varying,
    neighborhood_name character varying,
    cover_image_id integer
);


--
-- Name: locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.locations_id_seq OWNED BY public.locations.id;


--
-- Name: main_homepage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.main_homepage (
    id integer NOT NULL,
    draft_page_blocks jsonb DEFAULT '[]'::jsonb,
    published_page_blocks jsonb DEFAULT '[]'::jsonb,
    last_published_at timestamp(3) with time zone,
    last_published_by_id integer,
    published_revision numeric DEFAULT 0,
    updated_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone
);


--
-- Name: main_homepage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.main_homepage_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: main_homepage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.main_homepage_id_seq OWNED BY public.main_homepage.id;


--
-- Name: media_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_assets (
    id integer NOT NULL,
    uploaded_by character varying,
    prefix character varying DEFAULT 'media'::character varying,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    url character varying,
    thumbnail_u_r_l character varying,
    filename character varying,
    mime_type character varying,
    filesize numeric,
    width numeric,
    height numeric,
    focal_x numeric,
    focal_y numeric,
    user_id integer,
    alt_text character varying,
    photographer_credit character varying,
    location character varying,
    location_finalized boolean DEFAULT false,
    location_ref_id integer,
    media_set_id integer,
    variant public.enum_media_assets_variant,
    bunny_original_url character varying
);


--
-- Name: media_assets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.media_assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: media_assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.media_assets_id_seq OWNED BY public.media_assets.id;


--
-- Name: media_assets_rels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_assets_rels (
    id integer NOT NULL,
    "order" integer,
    parent_id integer NOT NULL,
    path character varying NOT NULL,
    article_tags_id integer
);


--
-- Name: media_assets_rels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.media_assets_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: media_assets_rels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.media_assets_rels_id_seq OWNED BY public.media_assets_rels.id;


--
-- Name: media_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_sets (
    id integer NOT NULL,
    title character varying NOT NULL,
    alt_text character varying,
    photographer_credit character varying,
    variants_thumbnail_id integer,
    variants_square_id integer,
    variants_wide_id integer,
    variants_portrait_id integer,
    variants_hero_id integer,
    external_ref character varying,
    status public.enum_media_sets_status DEFAULT 'empty'::public.enum_media_sets_status,
    created_by_id integer,
    location character varying,
    location_ref_id integer,
    location_finalized boolean DEFAULT false,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    variants_open_graph_id integer,
    variants_editorial_id integer,
    source_id integer,
    focal_point_x numeric DEFAULT 0.5 NOT NULL,
    focal_point_y numeric DEFAULT 0.5 NOT NULL
);


--
-- Name: media_sets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.media_sets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: media_sets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.media_sets_id_seq OWNED BY public.media_sets.id;


--
-- Name: media_sets_rels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_sets_rels (
    id integer NOT NULL,
    "order" integer,
    parent_id integer NOT NULL,
    path character varying NOT NULL,
    article_tags_id integer
);


--
-- Name: media_sets_rels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.media_sets_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: media_sets_rels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.media_sets_rels_id_seq OWNED BY public.media_sets_rels.id;


--
-- Name: nightlife; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nightlife (
    id integer NOT NULL,
    title character varying NOT NULL,
    type public.enum_nightlife_type,
    location character varying NOT NULL,
    location_ref_id integer,
    address character varying,
    country_code public.enum_nightlife_country_code,
    phone_number character varying,
    website character varying,
    latitude numeric,
    longitude numeric,
    created_by_id integer,
    status public.enum_nightlife_status DEFAULT 'draft'::public.enum_nightlife_status,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    price_level public.enum_nightlife_price_level,
    nightlife_details_core_name character varying,
    nightlife_details_core_club_type character varying,
    nightlife_details_core_price_tier character varying,
    nightlife_details_the_space_venue_type character varying,
    nightlife_details_the_space_venue_size character varying,
    nightlife_details_the_space_peak_hours character varying,
    nightlife_details_the_scene_tourist_presence character varying,
    nightlife_details_the_scene_energy_level character varying,
    nightlife_details_the_scene_vip_and_bottle_service character varying,
    nightlife_details_the_scene_crowd_profile character varying,
    nightlife_details_the_details_operation_hours jsonb,
    nightlife_details_the_details_daytime_restaurant boolean,
    email character varying,
    iana_time_id character varying,
    nightlife_details_the_details_booking_url character varying
);


--
-- Name: nightlife_gallery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nightlife_gallery (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    image_id integer NOT NULL
);


--
-- Name: nightlife_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nightlife_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nightlife_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nightlife_id_seq OWNED BY public.nightlife.id;


--
-- Name: nightlife_instagram_gallery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nightlife_instagram_gallery (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    post_id integer
);


--
-- Name: nightlife_texts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nightlife_texts (
    id integer NOT NULL,
    "order" integer NOT NULL,
    parent_id integer NOT NULL,
    path character varying NOT NULL,
    text character varying
);


--
-- Name: nightlife_texts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nightlife_texts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nightlife_texts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nightlife_texts_id_seq OWNED BY public.nightlife_texts.id;


--
-- Name: payload_kv; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payload_kv (
    id integer NOT NULL,
    key character varying NOT NULL,
    data jsonb NOT NULL
);


--
-- Name: payload_kv_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payload_kv_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payload_kv_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payload_kv_id_seq OWNED BY public.payload_kv.id;


--
-- Name: payload_locked_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payload_locked_documents (
    id integer NOT NULL,
    global_slug character varying,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);


--
-- Name: payload_locked_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payload_locked_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payload_locked_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payload_locked_documents_id_seq OWNED BY public.payload_locked_documents.id;


--
-- Name: payload_locked_documents_rels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payload_locked_documents_rels (
    id integer NOT NULL,
    "order" integer,
    parent_id integer NOT NULL,
    path character varying NOT NULL,
    users_id integer,
    media_assets_id integer,
    articles_id integer,
    locations_id integer,
    affiliate_products_id integer,
    instagram_posts_id integer,
    perfect_for_tags_id integer,
    article_categories_id integer,
    article_tags_id integer,
    media_sets_id integer,
    accommodations_id integer,
    dining_id integer,
    attractions_id integer,
    nightlife_id integer,
    single_type_listicles_id integer,
    listicle_itineraries_id integer,
    key_locations_id integer,
    currencies_id integer,
    location_homepages_id integer,
    tours_id integer,
    article_redirects_id integer,
    visitor_profiles_id integer,
    stripe_webhook_events_id integer,
    authors_id integer,
    service_accounts_id integer,
    bookmarks_id integer,
    refresh_jobs_id integer
);


--
-- Name: payload_locked_documents_rels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payload_locked_documents_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payload_locked_documents_rels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payload_locked_documents_rels_id_seq OWNED BY public.payload_locked_documents_rels.id;


--
-- Name: payload_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payload_migrations (
    id integer NOT NULL,
    name character varying,
    batch numeric,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);


--
-- Name: payload_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payload_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payload_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payload_migrations_id_seq OWNED BY public.payload_migrations.id;


--
-- Name: payload_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payload_preferences (
    id integer NOT NULL,
    key character varying,
    value jsonb,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);


--
-- Name: payload_preferences_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payload_preferences_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payload_preferences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payload_preferences_id_seq OWNED BY public.payload_preferences.id;


--
-- Name: payload_preferences_rels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payload_preferences_rels (
    id integer NOT NULL,
    "order" integer,
    parent_id integer NOT NULL,
    path character varying NOT NULL,
    users_id integer,
    service_accounts_id integer
);


--
-- Name: payload_preferences_rels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payload_preferences_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payload_preferences_rels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payload_preferences_rels_id_seq OWNED BY public.payload_preferences_rels.id;


--
-- Name: perfect_for_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.perfect_for_tags (
    id integer NOT NULL,
    label character varying NOT NULL,
    slug character varying,
    category public.enum_perfect_for_tags_category NOT NULL,
    description character varying,
    status public.enum_perfect_for_tags_status DEFAULT 'active'::public.enum_perfect_for_tags_status,
    usage_count numeric DEFAULT 0,
    created_by_id integer,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);


--
-- Name: perfect_for_tags_applicable_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.perfect_for_tags_applicable_types (
    "order" integer NOT NULL,
    parent_id integer NOT NULL,
    value public.enum_perfect_for_tags_applicable_types,
    id integer NOT NULL
);


--
-- Name: perfect_for_tags_applicable_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.perfect_for_tags_applicable_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: perfect_for_tags_applicable_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.perfect_for_tags_applicable_types_id_seq OWNED BY public.perfect_for_tags_applicable_types.id;


--
-- Name: perfect_for_tags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.perfect_for_tags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: perfect_for_tags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.perfect_for_tags_id_seq OWNED BY public.perfect_for_tags.id;


--
-- Name: public_search_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.public_search_documents (
    type_key text NOT NULL,
    doc_id integer NOT NULL,
    language text NOT NULL,
    published_at timestamp with time zone,
    title text,
    phrase_text text NOT NULL,
    document tsvector NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: refresh_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_jobs (
    id integer NOT NULL,
    kind public.enum_refresh_jobs_kind NOT NULL,
    dedupe_key character varying NOT NULL,
    target jsonb NOT NULL,
    reason character varying,
    status public.enum_refresh_jobs_status DEFAULT 'pending'::public.enum_refresh_jobs_status NOT NULL,
    attempts numeric DEFAULT 0 NOT NULL,
    next_attempt_at timestamp(3) with time zone NOT NULL,
    locked_until timestamp(3) with time zone,
    last_error character varying,
    completed_at timestamp(3) with time zone,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    generation numeric DEFAULT 1 NOT NULL,
    claim_token character varying,
    claimed_generation numeric
);


--
-- Name: refresh_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.refresh_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.refresh_jobs_id_seq OWNED BY public.refresh_jobs.id;


--
-- Name: service_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_accounts (
    id integer NOT NULL,
    name character varying NOT NULL,
    description character varying,
    enable_a_p_i_key boolean,
    api_key character varying,
    api_key_index character varying,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: service_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.service_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: service_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.service_accounts_id_seq OWNED BY public.service_accounts.id;


--
-- Name: single_type_listicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.single_type_listicles (
    id integer NOT NULL,
    step1_complete boolean DEFAULT false,
    in_update_mode boolean DEFAULT false,
    slug character varying NOT NULL,
    title character varying NOT NULL,
    location character varying NOT NULL,
    location_ref_id integer,
    listicle_type public.enum_single_type_listicles_listicle_type NOT NULL,
    target_item_count numeric DEFAULT 6 NOT NULL,
    step1_ui_wrapper character varying,
    header_intro jsonb,
    header_featured_image_id integer,
    status public.enum_single_type_listicles_status DEFAULT 'draft'::public.enum_single_type_listicles_status,
    author_id integer NOT NULL,
    published_at timestamp(3) with time zone,
    article_type public.enum_single_type_listicles_article_type DEFAULT 'single-type-listicle'::public.enum_single_type_listicles_article_type NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    seo_section_seo_title character varying,
    seo_section_meta_description character varying,
    seo_section_open_graph_title character varying,
    seo_section_open_graph_description character varying,
    seo_section_open_graph_image_url character varying,
    seo_section_open_graph_url character varying,
    seo_section_twitter_card_card public.enum_single_type_listicles_seo_section_twitter_card_card DEFAULT 'summary'::public.enum_single_type_listicles_seo_section_twitter_card_card,
    seo_section_twitter_card_title character varying,
    seo_section_twitter_card_description character varying,
    seo_section_twitter_card_image_url character varying,
    seo_section_structured_data jsonb,
    seo_section_robots_index public.enum_single_type_listicles_seo_section_robots_index DEFAULT 'index'::public.enum_single_type_listicles_seo_section_robots_index,
    seo_section_robots_follow public.enum_single_type_listicles_seo_section_robots_follow DEFAULT 'follow'::public.enum_single_type_listicles_seo_section_robots_follow,
    language public.enum_single_type_listicles_language DEFAULT 'en'::public.enum_single_type_listicles_language NOT NULL,
    header_featured_media_set_id integer,
    list_tone public.enum_single_type_listicles_list_tone DEFAULT 'elevated'::public.enum_single_type_listicles_list_tone,
    access public.enum_single_type_listicles_access DEFAULT 'free'::public.enum_single_type_listicles_access NOT NULL
);


--
-- Name: single_type_listicles_blocks_data_accommodations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.single_type_listicles_blocks_data_accommodations (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    item_id integer,
    blurb jsonb,
    block_name character varying,
    media_mode public.stl_media_mode,
    selected_instagram_post_id integer,
    angle public.enum_single_type_listicles_blocks_data_accommodations_angle
);


--
-- Name: single_type_listicles_blocks_data_attractions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.single_type_listicles_blocks_data_attractions (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    item_id integer,
    blurb jsonb,
    block_name character varying,
    media_mode public.stl_media_mode,
    selected_instagram_post_id integer,
    angle public.enum_single_type_listicles_blocks_data_attractions_angle
);


--
-- Name: single_type_listicles_blocks_data_dining; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.single_type_listicles_blocks_data_dining (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    item_id integer,
    blurb jsonb,
    block_name character varying,
    media_mode public.stl_media_mode,
    selected_instagram_post_id integer,
    angle public.enum_single_type_listicles_blocks_data_dining_angle
);


--
-- Name: single_type_listicles_blocks_data_nightlife; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.single_type_listicles_blocks_data_nightlife (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    _path text NOT NULL,
    id character varying NOT NULL,
    item_id integer,
    blurb jsonb,
    block_name character varying,
    media_mode public.stl_media_mode,
    selected_instagram_post_id integer,
    angle public.enum_single_type_listicles_blocks_data_nightlife_angle
);


--
-- Name: single_type_listicles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.single_type_listicles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: single_type_listicles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.single_type_listicles_id_seq OWNED BY public.single_type_listicles.id;


--
-- Name: single_type_listicles_rels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.single_type_listicles_rels (
    id integer NOT NULL,
    "order" integer,
    parent_id integer NOT NULL,
    path character varying NOT NULL,
    media_sets_id integer,
    locations_id integer,
    tours_id integer
);


--
-- Name: single_type_listicles_rels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.single_type_listicles_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: single_type_listicles_rels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.single_type_listicles_rels_id_seq OWNED BY public.single_type_listicles_rels.id;


--
-- Name: stripe_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stripe_webhook_events (
    id integer NOT NULL,
    event_id character varying NOT NULL,
    event_type character varying NOT NULL,
    event_created numeric NOT NULL,
    subscription_id character varying,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);


--
-- Name: stripe_webhook_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stripe_webhook_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stripe_webhook_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stripe_webhook_events_id_seq OWNED BY public.stripe_webhook_events.id;


--
-- Name: tours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tours (
    id integer NOT NULL,
    title character varying NOT NULL,
    img_id integer NOT NULL,
    booking_link character varying NOT NULL,
    price character varying NOT NULL,
    created_by_id integer,
    status public.enum_tours_status DEFAULT 'draft'::public.enum_tours_status,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    location_ref_id integer
);


--
-- Name: tours_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tours_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tours_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tours_id_seq OWNED BY public.tours.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    role public.enum_users_role DEFAULT 'writer'::public.enum_users_role NOT NULL,
    email character varying NOT NULL,
    first_name character varying,
    last_name character varying,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    reset_password_token character varying,
    reset_password_expiration timestamp(3) with time zone,
    salt character varying,
    hash character varying,
    status public.enum_users_status DEFAULT 'active'::public.enum_users_status NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: users_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users_sessions (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    created_at timestamp(3) with time zone,
    expires_at timestamp(3) with time zone NOT NULL
);


--
-- Name: visitor_auth_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitor_auth_accounts (
    id text NOT NULL,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" text NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp with time zone,
    "refreshTokenExpiresAt" timestamp with time zone,
    scope text,
    password text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: visitor_auth_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitor_auth_rate_limits (
    id text NOT NULL,
    key text NOT NULL,
    count integer NOT NULL,
    "lastRequest" bigint NOT NULL
);


--
-- Name: visitor_auth_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitor_auth_sessions (
    id text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    token text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "userId" text NOT NULL
);


--
-- Name: visitor_auth_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitor_auth_users (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    "emailVerified" boolean NOT NULL,
    image text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: visitor_auth_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitor_auth_verifications (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: visitor_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitor_profiles (
    id integer NOT NULL,
    auth_user_id character varying NOT NULL,
    email character varying NOT NULL,
    first_name character varying,
    last_name character varying,
    subscription_status public.enum_visitor_profiles_subscription_status DEFAULT 'none'::public.enum_visitor_profiles_subscription_status NOT NULL,
    cancel_at_period_end boolean DEFAULT false,
    stripe_customer_id character varying,
    stripe_subscription_id character varying,
    affiliate_referral_id character varying,
    affiliate_referred_at timestamp(3) with time zone,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    billing_email character varying,
    paid_through_at timestamp(3) with time zone,
    dunning_grace_until timestamp(3) with time zone
);


--
-- Name: visitor_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.visitor_profiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: visitor_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.visitor_profiles_id_seq OWNED BY public.visitor_profiles.id;


--
-- Name: accommodations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations ALTER COLUMN id SET DEFAULT nextval('public.accommodations_id_seq'::regclass);


--
-- Name: accommodations_the_experience_jacuzzi id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations_the_experience_jacuzzi ALTER COLUMN id SET DEFAULT nextval('public.accommodations_the_experience_jacuzzi_id_seq'::regclass);


--
-- Name: accommodations_the_experience_pool id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations_the_experience_pool ALTER COLUMN id SET DEFAULT nextval('public.accommodations_the_experience_pool_id_seq'::regclass);


--
-- Name: accommodations_the_experience_vibe id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations_the_experience_vibe ALTER COLUMN id SET DEFAULT nextval('public.accommodations_the_experience_vibe_id_seq'::regclass);


--
-- Name: accommodations_the_stay_parking id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations_the_stay_parking ALTER COLUMN id SET DEFAULT nextval('public.accommodations_the_stay_parking_id_seq'::regclass);


--
-- Name: accommodations_the_stay_perfect_for id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations_the_stay_perfect_for ALTER COLUMN id SET DEFAULT nextval('public.accommodations_the_stay_perfect_for_id_seq'::regclass);


--
-- Name: affiliate_products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_products ALTER COLUMN id SET DEFAULT nextval('public.affiliate_products_id_seq'::regclass);


--
-- Name: article_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_categories ALTER COLUMN id SET DEFAULT nextval('public.article_categories_id_seq'::regclass);


--
-- Name: article_redirects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_redirects ALTER COLUMN id SET DEFAULT nextval('public.article_redirects_id_seq'::regclass);


--
-- Name: article_tags id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_tags ALTER COLUMN id SET DEFAULT nextval('public.article_tags_id_seq'::regclass);


--
-- Name: articles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles ALTER COLUMN id SET DEFAULT nextval('public.articles_id_seq'::regclass);


--
-- Name: articles_rels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_rels ALTER COLUMN id SET DEFAULT nextval('public.articles_rels_id_seq'::regclass);


--
-- Name: attractions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attractions ALTER COLUMN id SET DEFAULT nextval('public.attractions_id_seq'::regclass);


--
-- Name: attractions_rels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attractions_rels ALTER COLUMN id SET DEFAULT nextval('public.attractions_rels_id_seq'::regclass);


--
-- Name: authors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authors ALTER COLUMN id SET DEFAULT nextval('public.authors_id_seq'::regclass);


--
-- Name: authors_article_byline_featured_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authors_article_byline_featured_links ALTER COLUMN id SET DEFAULT nextval('public.authors_article_byline_featured_links_id_seq'::regclass);


--
-- Name: bookmarks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmarks ALTER COLUMN id SET DEFAULT nextval('public.bookmarks_id_seq'::regclass);


--
-- Name: currencies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies ALTER COLUMN id SET DEFAULT nextval('public.currencies_id_seq'::regclass);


--
-- Name: currencies_regions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies_regions ALTER COLUMN id SET DEFAULT nextval('public.currencies_regions_id_seq'::regclass);


--
-- Name: dining id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dining ALTER COLUMN id SET DEFAULT nextval('public.dining_id_seq'::regclass);


--
-- Name: email_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_logs ALTER COLUMN id SET DEFAULT nextval('public.email_logs_id_seq'::regclass);


--
-- Name: instagram_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_posts ALTER COLUMN id SET DEFAULT nextval('public.instagram_posts_id_seq'::regclass);


--
-- Name: key_locations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_locations ALTER COLUMN id SET DEFAULT nextval('public.key_locations_id_seq'::regclass);


--
-- Name: listicle_itineraries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries ALTER COLUMN id SET DEFAULT nextval('public.listicle_itineraries_id_seq'::regclass);


--
-- Name: listicle_itineraries_rels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_rels ALTER COLUMN id SET DEFAULT nextval('public.listicle_itineraries_rels_id_seq'::regclass);


--
-- Name: location_homepages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages ALTER COLUMN id SET DEFAULT nextval('public.location_homepages_id_seq'::regclass);


--
-- Name: location_homepages_rels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_rels ALTER COLUMN id SET DEFAULT nextval('public.location_homepages_rels_id_seq'::regclass);


--
-- Name: locations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations ALTER COLUMN id SET DEFAULT nextval('public.locations_id_seq'::regclass);


--
-- Name: main_homepage id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.main_homepage ALTER COLUMN id SET DEFAULT nextval('public.main_homepage_id_seq'::regclass);


--
-- Name: media_assets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets ALTER COLUMN id SET DEFAULT nextval('public.media_assets_id_seq'::regclass);


--
-- Name: media_assets_rels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets_rels ALTER COLUMN id SET DEFAULT nextval('public.media_assets_rels_id_seq'::regclass);


--
-- Name: media_sets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_sets ALTER COLUMN id SET DEFAULT nextval('public.media_sets_id_seq'::regclass);


--
-- Name: media_sets_rels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_sets_rels ALTER COLUMN id SET DEFAULT nextval('public.media_sets_rels_id_seq'::regclass);


--
-- Name: nightlife id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nightlife ALTER COLUMN id SET DEFAULT nextval('public.nightlife_id_seq'::regclass);


--
-- Name: nightlife_texts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nightlife_texts ALTER COLUMN id SET DEFAULT nextval('public.nightlife_texts_id_seq'::regclass);


--
-- Name: payload_kv id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_kv ALTER COLUMN id SET DEFAULT nextval('public.payload_kv_id_seq'::regclass);


--
-- Name: payload_locked_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents ALTER COLUMN id SET DEFAULT nextval('public.payload_locked_documents_id_seq'::regclass);


--
-- Name: payload_locked_documents_rels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels ALTER COLUMN id SET DEFAULT nextval('public.payload_locked_documents_rels_id_seq'::regclass);


--
-- Name: payload_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_migrations ALTER COLUMN id SET DEFAULT nextval('public.payload_migrations_id_seq'::regclass);


--
-- Name: payload_preferences id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_preferences ALTER COLUMN id SET DEFAULT nextval('public.payload_preferences_id_seq'::regclass);


--
-- Name: payload_preferences_rels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_preferences_rels ALTER COLUMN id SET DEFAULT nextval('public.payload_preferences_rels_id_seq'::regclass);


--
-- Name: perfect_for_tags id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfect_for_tags ALTER COLUMN id SET DEFAULT nextval('public.perfect_for_tags_id_seq'::regclass);


--
-- Name: perfect_for_tags_applicable_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfect_for_tags_applicable_types ALTER COLUMN id SET DEFAULT nextval('public.perfect_for_tags_applicable_types_id_seq'::regclass);


--
-- Name: refresh_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_jobs ALTER COLUMN id SET DEFAULT nextval('public.refresh_jobs_id_seq'::regclass);


--
-- Name: service_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_accounts ALTER COLUMN id SET DEFAULT nextval('public.service_accounts_id_seq'::regclass);


--
-- Name: single_type_listicles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles ALTER COLUMN id SET DEFAULT nextval('public.single_type_listicles_id_seq'::regclass);


--
-- Name: single_type_listicles_rels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles_rels ALTER COLUMN id SET DEFAULT nextval('public.single_type_listicles_rels_id_seq'::regclass);


--
-- Name: stripe_webhook_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_webhook_events ALTER COLUMN id SET DEFAULT nextval('public.stripe_webhook_events_id_seq'::regclass);


--
-- Name: tours id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tours ALTER COLUMN id SET DEFAULT nextval('public.tours_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: visitor_profiles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_profiles ALTER COLUMN id SET DEFAULT nextval('public.visitor_profiles_id_seq'::regclass);


--
-- Name: accommodations_gallery accommodations_gallery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations_gallery
    ADD CONSTRAINT accommodations_gallery_pkey PRIMARY KEY (id);


--
-- Name: accommodations_instagram_gallery accommodations_instagram_gallery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations_instagram_gallery
    ADD CONSTRAINT accommodations_instagram_gallery_pkey PRIMARY KEY (id);


--
-- Name: accommodations accommodations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations
    ADD CONSTRAINT accommodations_pkey PRIMARY KEY (id);


--
-- Name: accommodations_the_experience_jacuzzi accommodations_the_experience_jacuzzi_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations_the_experience_jacuzzi
    ADD CONSTRAINT accommodations_the_experience_jacuzzi_pkey PRIMARY KEY (id);


--
-- Name: accommodations_the_experience_pool accommodations_the_experience_pool_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations_the_experience_pool
    ADD CONSTRAINT accommodations_the_experience_pool_pkey PRIMARY KEY (id);


--
-- Name: accommodations_the_experience_vibe accommodations_the_experience_vibe_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations_the_experience_vibe
    ADD CONSTRAINT accommodations_the_experience_vibe_pkey PRIMARY KEY (id);


--
-- Name: accommodations_the_stay_parking accommodations_the_stay_parking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations_the_stay_parking
    ADD CONSTRAINT accommodations_the_stay_parking_pkey PRIMARY KEY (id);


--
-- Name: accommodations_the_stay_perfect_for accommodations_the_stay_perfect_for_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations_the_stay_perfect_for
    ADD CONSTRAINT accommodations_the_stay_perfect_for_pkey PRIMARY KEY (id);


--
-- Name: affiliate_products affiliate_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_products
    ADD CONSTRAINT affiliate_products_pkey PRIMARY KEY (id);


--
-- Name: article_categories article_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_categories
    ADD CONSTRAINT article_categories_pkey PRIMARY KEY (id);


--
-- Name: article_redirects article_redirects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_redirects
    ADD CONSTRAINT article_redirects_pkey PRIMARY KEY (id);


--
-- Name: article_tags article_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_tags
    ADD CONSTRAINT article_tags_pkey PRIMARY KEY (id);


--
-- Name: articles_blocks_faq_items articles_blocks_faq_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_faq_items
    ADD CONSTRAINT articles_blocks_faq_items_pkey PRIMARY KEY (id);


--
-- Name: articles_blocks_faq articles_blocks_faq_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_faq
    ADD CONSTRAINT articles_blocks_faq_pkey PRIMARY KEY (id);


--
-- Name: articles_blocks_highlight_callout articles_blocks_highlight_callout_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_highlight_callout
    ADD CONSTRAINT articles_blocks_highlight_callout_pkey PRIMARY KEY (id);


--
-- Name: articles_blocks_image articles_blocks_image_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_image
    ADD CONSTRAINT articles_blocks_image_pkey PRIMARY KEY (id);


--
-- Name: articles_blocks_img_pair articles_blocks_img_pair_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_img_pair
    ADD CONSTRAINT articles_blocks_img_pair_pkey PRIMARY KEY (id);


--
-- Name: articles_blocks_img_trio articles_blocks_img_trio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_img_trio
    ADD CONSTRAINT articles_blocks_img_trio_pkey PRIMARY KEY (id);


--
-- Name: articles_blocks_in_the_know articles_blocks_in_the_know_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_in_the_know
    ADD CONSTRAINT articles_blocks_in_the_know_pkey PRIMARY KEY (id);


--
-- Name: articles_blocks_key_takeaway_items articles_blocks_key_takeaway_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_key_takeaway_items
    ADD CONSTRAINT articles_blocks_key_takeaway_items_pkey PRIMARY KEY (id);


--
-- Name: articles_blocks_key_takeaway articles_blocks_key_takeaway_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_key_takeaway
    ADD CONSTRAINT articles_blocks_key_takeaway_pkey PRIMARY KEY (id);


--
-- Name: articles_blocks_pull_quote articles_blocks_pull_quote_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_pull_quote
    ADD CONSTRAINT articles_blocks_pull_quote_pkey PRIMARY KEY (id);


--
-- Name: articles_blocks_text articles_blocks_text_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_text
    ADD CONSTRAINT articles_blocks_text_pkey PRIMARY KEY (id);


--
-- Name: articles articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_pkey PRIMARY KEY (id);


--
-- Name: articles_rels articles_rels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_rels
    ADD CONSTRAINT articles_rels_pkey PRIMARY KEY (id);


--
-- Name: attractions_gallery attractions_gallery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attractions_gallery
    ADD CONSTRAINT attractions_gallery_pkey PRIMARY KEY (id);


--
-- Name: attractions_instagram_gallery attractions_instagram_gallery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attractions_instagram_gallery
    ADD CONSTRAINT attractions_instagram_gallery_pkey PRIMARY KEY (id);


--
-- Name: attractions attractions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attractions
    ADD CONSTRAINT attractions_pkey PRIMARY KEY (id);


--
-- Name: attractions_rels attractions_rels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attractions_rels
    ADD CONSTRAINT attractions_rels_pkey PRIMARY KEY (id);


--
-- Name: authors_article_byline_featured_links authors_article_byline_featured_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authors_article_byline_featured_links
    ADD CONSTRAINT authors_article_byline_featured_links_pkey PRIMARY KEY (id);


--
-- Name: authors_author_images authors_author_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authors_author_images
    ADD CONSTRAINT authors_author_images_pkey PRIMARY KEY (id);


--
-- Name: authors_expertise authors_expertise_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authors_expertise
    ADD CONSTRAINT authors_expertise_pkey PRIMARY KEY (id);


--
-- Name: authors authors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authors
    ADD CONSTRAINT authors_pkey PRIMARY KEY (id);


--
-- Name: bookmarks bookmarks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmarks
    ADD CONSTRAINT bookmarks_pkey PRIMARY KEY (id);


--
-- Name: currencies currencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_pkey PRIMARY KEY (id);


--
-- Name: currencies_regions currencies_regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies_regions
    ADD CONSTRAINT currencies_regions_pkey PRIMARY KEY (id);


--
-- Name: currencies_used_in currencies_used_in_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies_used_in
    ADD CONSTRAINT currencies_used_in_pkey PRIMARY KEY (id);


--
-- Name: dining_gallery dining_gallery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dining_gallery
    ADD CONSTRAINT dining_gallery_pkey PRIMARY KEY (id);


--
-- Name: dining_instagram_gallery dining_instagram_gallery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dining_instagram_gallery
    ADD CONSTRAINT dining_instagram_gallery_pkey PRIMARY KEY (id);


--
-- Name: dining dining_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dining
    ADD CONSTRAINT dining_pkey PRIMARY KEY (id);


--
-- Name: email_logs email_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_pkey PRIMARY KEY (id);


--
-- Name: identity_email_owners identity_email_owners_owner_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_email_owners
    ADD CONSTRAINT identity_email_owners_owner_key UNIQUE (owner_kind, owner_id);


--
-- Name: identity_email_owners identity_email_owners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_email_owners
    ADD CONSTRAINT identity_email_owners_pkey PRIMARY KEY (normalized_email);


--
-- Name: instagram_posts instagram_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_posts
    ADD CONSTRAINT instagram_posts_pkey PRIMARY KEY (id);


--
-- Name: ita ita_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ita
    ADD CONSTRAINT ita_pkey PRIMARY KEY (id);


--
-- Name: key_locations_gallery key_locations_gallery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_locations_gallery
    ADD CONSTRAINT key_locations_gallery_pkey PRIMARY KEY (id);


--
-- Name: key_locations_instagram_gallery key_locations_instagram_gallery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_locations_instagram_gallery
    ADD CONSTRAINT key_locations_instagram_gallery_pkey PRIMARY KEY (id);


--
-- Name: key_locations key_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_locations
    ADD CONSTRAINT key_locations_pkey PRIMARY KEY (id);


--
-- Name: kls kls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kls
    ADD CONSTRAINT kls_pkey PRIMARY KEY (id);


--
-- Name: listicle_itineraries_blocks_itinerary_accommodations listicle_itineraries_blocks_itinerary_accommodations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_accommodations
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_accommodations_pkey PRIMARY KEY (id);


--
-- Name: listicle_itineraries_blocks_itinerary_attractions listicle_itineraries_blocks_itinerary_attractions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_attractions
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_attractions_pkey PRIMARY KEY (id);


--
-- Name: listicle_itineraries_blocks_itinerary_dining listicle_itineraries_blocks_itinerary_dining_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_dining
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_dining_pkey PRIMARY KEY (id);


--
-- Name: listicle_itineraries_blocks_itinerary_key_location listicle_itineraries_blocks_itinerary_key_location_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_key_location
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_key_location_pkey PRIMARY KEY (id);


--
-- Name: listicle_itineraries_blocks_itinerary_nightlife listicle_itineraries_blocks_itinerary_nightlife_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_nightlife
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_nightlife_pkey PRIMARY KEY (id);


--
-- Name: listicle_itineraries_blocks_itinerary_where_staying listicle_itineraries_blocks_itinerary_where_staying_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_where_staying
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_where_staying_pkey PRIMARY KEY (id);


--
-- Name: listicle_itineraries_itinerary_days listicle_itineraries_itinerary_days_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_itinerary_days
    ADD CONSTRAINT listicle_itineraries_itinerary_days_pkey PRIMARY KEY (id);


--
-- Name: listicle_itineraries listicle_itineraries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries
    ADD CONSTRAINT listicle_itineraries_pkey PRIMARY KEY (id);


--
-- Name: listicle_itineraries_rels listicle_itineraries_rels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_rels
    ADD CONSTRAINT listicle_itineraries_rels_pkey PRIMARY KEY (id);


--
-- Name: location_homepages_blocks_article_grid location_homepages_blocks_article_grid_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_article_grid
    ADD CONSTRAINT location_homepages_blocks_article_grid_pkey PRIMARY KEY (id);


--
-- Name: location_homepages_blocks_article_list location_homepages_blocks_article_list_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_article_list
    ADD CONSTRAINT location_homepages_blocks_article_list_pkey PRIMARY KEY (id);


--
-- Name: location_homepages_blocks_author_feature_author_cards location_homepages_blocks_author_feature_author_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_author_feature_author_cards
    ADD CONSTRAINT location_homepages_blocks_author_feature_author_cards_pkey PRIMARY KEY (id);


--
-- Name: location_homepages_blocks_author_feature location_homepages_blocks_author_feature_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_author_feature
    ADD CONSTRAINT location_homepages_blocks_author_feature_pkey PRIMARY KEY (id);


--
-- Name: location_homepages_blocks_author_feature_selected_expertise location_homepages_blocks_author_feature_selected_expertis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_author_feature_selected_expertise
    ADD CONSTRAINT location_homepages_blocks_author_feature_selected_expertis_pkey PRIMARY KEY (id);


--
-- Name: location_homepages_blocks_editorial_feature location_homepages_blocks_editorial_feature_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_editorial_feature
    ADD CONSTRAINT location_homepages_blocks_editorial_feature_pkey PRIMARY KEY (id);


--
-- Name: location_homepages_blocks_featured_article_carousel location_homepages_blocks_featured_article_carousel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_featured_article_carousel
    ADD CONSTRAINT location_homepages_blocks_featured_article_carousel_pkey PRIMARY KEY (id);


--
-- Name: location_homepages_blocks_featured_article location_homepages_blocks_featured_article_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_featured_article
    ADD CONSTRAINT location_homepages_blocks_featured_article_pkey PRIMARY KEY (id);


--
-- Name: location_homepages_blocks_featured_articles location_homepages_blocks_featured_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_featured_articles
    ADD CONSTRAINT location_homepages_blocks_featured_articles_pkey PRIMARY KEY (id);


--
-- Name: location_homepages_blocks_featured_creator_article location_homepages_blocks_featured_creator_article_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_featured_creator_article
    ADD CONSTRAINT location_homepages_blocks_featured_creator_article_pkey PRIMARY KEY (id);


--
-- Name: location_homepages_blocks_hotel_grid location_homepages_blocks_hotel_grid_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_hotel_grid
    ADD CONSTRAINT location_homepages_blocks_hotel_grid_pkey PRIMARY KEY (id);


--
-- Name: location_homepages_blocks_location_grid location_homepages_blocks_location_grid_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_location_grid
    ADD CONSTRAINT location_homepages_blocks_location_grid_pkey PRIMARY KEY (id);


--
-- Name: location_homepages_blocks_newsletter_signup location_homepages_blocks_newsletter_signup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_newsletter_signup
    ADD CONSTRAINT location_homepages_blocks_newsletter_signup_pkey PRIMARY KEY (id);


--
-- Name: location_homepages_blocks_questurian_maps location_homepages_blocks_questurian_maps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_questurian_maps
    ADD CONSTRAINT location_homepages_blocks_questurian_maps_pkey PRIMARY KEY (id);


--
-- Name: location_homepages_blocks_things_to_do_attractions location_homepages_blocks_things_to_do_attractions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_things_to_do_attractions
    ADD CONSTRAINT location_homepages_blocks_things_to_do_attractions_pkey PRIMARY KEY (id);


--
-- Name: location_homepages_blocks_things_to_do_listicles location_homepages_blocks_things_to_do_listicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_things_to_do_listicles
    ADD CONSTRAINT location_homepages_blocks_things_to_do_listicles_pkey PRIMARY KEY (id);


--
-- Name: location_homepages_blocks_tour_grid location_homepages_blocks_tour_grid_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_tour_grid
    ADD CONSTRAINT location_homepages_blocks_tour_grid_pkey PRIMARY KEY (id);


--
-- Name: location_homepages_blocks_where_to_eat_drink location_homepages_blocks_where_to_eat_drink_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_where_to_eat_drink
    ADD CONSTRAINT location_homepages_blocks_where_to_eat_drink_pkey PRIMARY KEY (id);


--
-- Name: location_homepages location_homepages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages
    ADD CONSTRAINT location_homepages_pkey PRIMARY KEY (id);


--
-- Name: location_homepages_rels location_homepages_rels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_rels
    ADD CONSTRAINT location_homepages_rels_pkey PRIMARY KEY (id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: main_homepage main_homepage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.main_homepage
    ADD CONSTRAINT main_homepage_pkey PRIMARY KEY (id);


--
-- Name: media_assets media_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_pkey PRIMARY KEY (id);


--
-- Name: media_assets_rels media_assets_rels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets_rels
    ADD CONSTRAINT media_assets_rels_pkey PRIMARY KEY (id);


--
-- Name: media_sets media_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_sets
    ADD CONSTRAINT media_sets_pkey PRIMARY KEY (id);


--
-- Name: media_sets_rels media_sets_rels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_sets_rels
    ADD CONSTRAINT media_sets_rels_pkey PRIMARY KEY (id);


--
-- Name: nightlife_gallery nightlife_gallery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nightlife_gallery
    ADD CONSTRAINT nightlife_gallery_pkey PRIMARY KEY (id);


--
-- Name: nightlife_instagram_gallery nightlife_instagram_gallery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nightlife_instagram_gallery
    ADD CONSTRAINT nightlife_instagram_gallery_pkey PRIMARY KEY (id);


--
-- Name: nightlife nightlife_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nightlife
    ADD CONSTRAINT nightlife_pkey PRIMARY KEY (id);


--
-- Name: nightlife_texts nightlife_texts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nightlife_texts
    ADD CONSTRAINT nightlife_texts_pkey PRIMARY KEY (id);


--
-- Name: payload_kv payload_kv_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_kv
    ADD CONSTRAINT payload_kv_pkey PRIMARY KEY (id);


--
-- Name: payload_locked_documents payload_locked_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents
    ADD CONSTRAINT payload_locked_documents_pkey PRIMARY KEY (id);


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_pkey PRIMARY KEY (id);


--
-- Name: payload_migrations payload_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_migrations
    ADD CONSTRAINT payload_migrations_pkey PRIMARY KEY (id);


--
-- Name: payload_preferences payload_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_preferences
    ADD CONSTRAINT payload_preferences_pkey PRIMARY KEY (id);


--
-- Name: payload_preferences_rels payload_preferences_rels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_preferences_rels
    ADD CONSTRAINT payload_preferences_rels_pkey PRIMARY KEY (id);


--
-- Name: perfect_for_tags_applicable_types perfect_for_tags_applicable_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfect_for_tags_applicable_types
    ADD CONSTRAINT perfect_for_tags_applicable_types_pkey PRIMARY KEY (id);


--
-- Name: perfect_for_tags perfect_for_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfect_for_tags
    ADD CONSTRAINT perfect_for_tags_pkey PRIMARY KEY (id);


--
-- Name: public_search_documents public_search_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_search_documents
    ADD CONSTRAINT public_search_documents_pkey PRIMARY KEY (type_key, doc_id);


--
-- Name: refresh_jobs refresh_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_jobs
    ADD CONSTRAINT refresh_jobs_pkey PRIMARY KEY (id);


--
-- Name: service_accounts service_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_accounts
    ADD CONSTRAINT service_accounts_pkey PRIMARY KEY (id);


--
-- Name: single_type_listicles_blocks_data_accommodations single_type_listicles_blocks_data_accommodations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles_blocks_data_accommodations
    ADD CONSTRAINT single_type_listicles_blocks_data_accommodations_pkey PRIMARY KEY (id);


--
-- Name: single_type_listicles_blocks_data_attractions single_type_listicles_blocks_data_attractions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles_blocks_data_attractions
    ADD CONSTRAINT single_type_listicles_blocks_data_attractions_pkey PRIMARY KEY (id);


--
-- Name: single_type_listicles_blocks_data_dining single_type_listicles_blocks_data_dining_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles_blocks_data_dining
    ADD CONSTRAINT single_type_listicles_blocks_data_dining_pkey PRIMARY KEY (id);


--
-- Name: single_type_listicles_blocks_data_nightlife single_type_listicles_blocks_data_nightlife_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles_blocks_data_nightlife
    ADD CONSTRAINT single_type_listicles_blocks_data_nightlife_pkey PRIMARY KEY (id);


--
-- Name: single_type_listicles single_type_listicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles
    ADD CONSTRAINT single_type_listicles_pkey PRIMARY KEY (id);


--
-- Name: single_type_listicles_rels single_type_listicles_rels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles_rels
    ADD CONSTRAINT single_type_listicles_rels_pkey PRIMARY KEY (id);


--
-- Name: stripe_webhook_events stripe_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: tours tours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tours
    ADD CONSTRAINT tours_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users_sessions users_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users_sessions
    ADD CONSTRAINT users_sessions_pkey PRIMARY KEY (id);


--
-- Name: visitor_auth_accounts visitor_auth_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_auth_accounts
    ADD CONSTRAINT visitor_auth_accounts_pkey PRIMARY KEY (id);


--
-- Name: visitor_auth_rate_limits visitor_auth_rate_limits_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_auth_rate_limits
    ADD CONSTRAINT visitor_auth_rate_limits_key_key UNIQUE (key);


--
-- Name: visitor_auth_rate_limits visitor_auth_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_auth_rate_limits
    ADD CONSTRAINT visitor_auth_rate_limits_pkey PRIMARY KEY (id);


--
-- Name: visitor_auth_sessions visitor_auth_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_auth_sessions
    ADD CONSTRAINT visitor_auth_sessions_pkey PRIMARY KEY (id);


--
-- Name: visitor_auth_sessions visitor_auth_sessions_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_auth_sessions
    ADD CONSTRAINT visitor_auth_sessions_token_key UNIQUE (token);


--
-- Name: visitor_auth_users visitor_auth_users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_auth_users
    ADD CONSTRAINT visitor_auth_users_email_key UNIQUE (email);


--
-- Name: visitor_auth_users visitor_auth_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_auth_users
    ADD CONSTRAINT visitor_auth_users_pkey PRIMARY KEY (id);


--
-- Name: visitor_auth_verifications visitor_auth_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_auth_verifications
    ADD CONSTRAINT visitor_auth_verifications_pkey PRIMARY KEY (id);


--
-- Name: visitor_profiles visitor_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_profiles
    ADD CONSTRAINT visitor_profiles_pkey PRIMARY KEY (id);


--
-- Name: accommodations_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accommodations_created_at_idx ON public.accommodations USING btree (created_at);


--
-- Name: accommodations_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accommodations_created_by_idx ON public.accommodations USING btree (created_by_id);


--
-- Name: accommodations_gallery_image_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accommodations_gallery_image_idx ON public.accommodations_gallery USING btree (image_id);


--
-- Name: accommodations_gallery_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accommodations_gallery_order_idx ON public.accommodations_gallery USING btree (_order);


--
-- Name: accommodations_gallery_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accommodations_gallery_parent_id_idx ON public.accommodations_gallery USING btree (_parent_id);


--
-- Name: accommodations_instagram_gallery_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accommodations_instagram_gallery_order_idx ON public.accommodations_instagram_gallery USING btree (_order);


--
-- Name: accommodations_instagram_gallery_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accommodations_instagram_gallery_parent_id_idx ON public.accommodations_instagram_gallery USING btree (_parent_id);


--
-- Name: accommodations_instagram_gallery_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accommodations_instagram_gallery_post_idx ON public.accommodations_instagram_gallery USING btree (post_id);


--
-- Name: accommodations_location_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accommodations_location_ref_idx ON public.accommodations USING btree (location_ref_id);


--
-- Name: accommodations_the_experience_jacuzzi_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accommodations_the_experience_jacuzzi_order_idx ON public.accommodations_the_experience_jacuzzi USING btree ("order");


--
-- Name: accommodations_the_experience_jacuzzi_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accommodations_the_experience_jacuzzi_parent_idx ON public.accommodations_the_experience_jacuzzi USING btree (parent_id);


--
-- Name: accommodations_the_experience_pool_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accommodations_the_experience_pool_order_idx ON public.accommodations_the_experience_pool USING btree ("order");


--
-- Name: accommodations_the_experience_pool_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accommodations_the_experience_pool_parent_idx ON public.accommodations_the_experience_pool USING btree (parent_id);


--
-- Name: accommodations_the_experience_vibe_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accommodations_the_experience_vibe_order_idx ON public.accommodations_the_experience_vibe USING btree ("order");


--
-- Name: accommodations_the_experience_vibe_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accommodations_the_experience_vibe_parent_idx ON public.accommodations_the_experience_vibe USING btree (parent_id);


--
-- Name: accommodations_the_stay_parking_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accommodations_the_stay_parking_order_idx ON public.accommodations_the_stay_parking USING btree ("order");


--
-- Name: accommodations_the_stay_parking_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accommodations_the_stay_parking_parent_idx ON public.accommodations_the_stay_parking USING btree (parent_id);


--
-- Name: accommodations_the_stay_perfect_for_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accommodations_the_stay_perfect_for_order_idx ON public.accommodations_the_stay_perfect_for USING btree ("order");


--
-- Name: accommodations_the_stay_perfect_for_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accommodations_the_stay_perfect_for_parent_idx ON public.accommodations_the_stay_perfect_for USING btree (parent_id);


--
-- Name: accommodations_title_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX accommodations_title_idx ON public.accommodations USING btree (title);


--
-- Name: accommodations_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accommodations_updated_at_idx ON public.accommodations USING btree (updated_at);


--
-- Name: affiliate_products_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX affiliate_products_created_at_idx ON public.affiliate_products USING btree (created_at);


--
-- Name: affiliate_products_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX affiliate_products_created_by_idx ON public.affiliate_products USING btree (created_by_id);


--
-- Name: affiliate_products_featured_image_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX affiliate_products_featured_image_idx ON public.affiliate_products USING btree (featured_image_id);


--
-- Name: affiliate_products_title_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX affiliate_products_title_idx ON public.affiliate_products USING btree (title);


--
-- Name: affiliate_products_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX affiliate_products_updated_at_idx ON public.affiliate_products USING btree (updated_at);


--
-- Name: article_categories_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX article_categories_created_at_idx ON public.article_categories USING btree (created_at);


--
-- Name: article_categories_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX article_categories_created_by_idx ON public.article_categories USING btree (created_by_id);


--
-- Name: article_categories_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX article_categories_name_idx ON public.article_categories USING btree (name);


--
-- Name: article_categories_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX article_categories_slug_idx ON public.article_categories USING btree (slug);


--
-- Name: article_categories_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX article_categories_updated_at_idx ON public.article_categories USING btree (updated_at);


--
-- Name: article_redirects_article_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX article_redirects_article_idx ON public.article_redirects USING btree (article_id);


--
-- Name: article_redirects_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX article_redirects_created_at_idx ON public.article_redirects USING btree (created_at);


--
-- Name: article_redirects_new_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX article_redirects_new_path_idx ON public.article_redirects USING btree (new_path);


--
-- Name: article_redirects_old_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX article_redirects_old_path_idx ON public.article_redirects USING btree (old_path);


--
-- Name: article_redirects_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX article_redirects_updated_at_idx ON public.article_redirects USING btree (updated_at);


--
-- Name: article_tags_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX article_tags_created_at_idx ON public.article_tags USING btree (created_at);


--
-- Name: article_tags_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX article_tags_created_by_idx ON public.article_tags USING btree (created_by_id);


--
-- Name: article_tags_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX article_tags_name_idx ON public.article_tags USING btree (name);


--
-- Name: article_tags_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX article_tags_slug_idx ON public.article_tags USING btree (slug);


--
-- Name: article_tags_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX article_tags_updated_at_idx ON public.article_tags USING btree (updated_at);


--
-- Name: articles_author_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_author_idx ON public.articles USING btree (author_id);


--
-- Name: articles_blocks_faq_items_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_faq_items_order_idx ON public.articles_blocks_faq_items USING btree (_order);


--
-- Name: articles_blocks_faq_items_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_faq_items_parent_id_idx ON public.articles_blocks_faq_items USING btree (_parent_id);


--
-- Name: articles_blocks_faq_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_faq_order_idx ON public.articles_blocks_faq USING btree (_order);


--
-- Name: articles_blocks_faq_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_faq_parent_id_idx ON public.articles_blocks_faq USING btree (_parent_id);


--
-- Name: articles_blocks_faq_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_faq_path_idx ON public.articles_blocks_faq USING btree (_path);


--
-- Name: articles_blocks_highlight_callout_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_highlight_callout_order_idx ON public.articles_blocks_highlight_callout USING btree (_order);


--
-- Name: articles_blocks_highlight_callout_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_highlight_callout_parent_id_idx ON public.articles_blocks_highlight_callout USING btree (_parent_id);


--
-- Name: articles_blocks_highlight_callout_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_highlight_callout_path_idx ON public.articles_blocks_highlight_callout USING btree (_path);


--
-- Name: articles_blocks_image_image_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_image_image_idx ON public.articles_blocks_image USING btree (image_id);


--
-- Name: articles_blocks_image_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_image_order_idx ON public.articles_blocks_image USING btree (_order);


--
-- Name: articles_blocks_image_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_image_parent_id_idx ON public.articles_blocks_image USING btree (_parent_id);


--
-- Name: articles_blocks_image_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_image_path_idx ON public.articles_blocks_image USING btree (_path);


--
-- Name: articles_blocks_img_pair_image_one_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_img_pair_image_one_idx ON public.articles_blocks_img_pair USING btree (image_one_id);


--
-- Name: articles_blocks_img_pair_image_two_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_img_pair_image_two_idx ON public.articles_blocks_img_pair USING btree (image_two_id);


--
-- Name: articles_blocks_img_pair_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_img_pair_order_idx ON public.articles_blocks_img_pair USING btree (_order);


--
-- Name: articles_blocks_img_pair_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_img_pair_parent_id_idx ON public.articles_blocks_img_pair USING btree (_parent_id);


--
-- Name: articles_blocks_img_pair_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_img_pair_path_idx ON public.articles_blocks_img_pair USING btree (_path);


--
-- Name: articles_blocks_img_trio_image_one_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_img_trio_image_one_idx ON public.articles_blocks_img_trio USING btree (image_one_id);


--
-- Name: articles_blocks_img_trio_image_three_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_img_trio_image_three_idx ON public.articles_blocks_img_trio USING btree (image_three_id);


--
-- Name: articles_blocks_img_trio_image_two_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_img_trio_image_two_idx ON public.articles_blocks_img_trio USING btree (image_two_id);


--
-- Name: articles_blocks_img_trio_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_img_trio_order_idx ON public.articles_blocks_img_trio USING btree (_order);


--
-- Name: articles_blocks_img_trio_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_img_trio_parent_id_idx ON public.articles_blocks_img_trio USING btree (_parent_id);


--
-- Name: articles_blocks_img_trio_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_img_trio_path_idx ON public.articles_blocks_img_trio USING btree (_path);


--
-- Name: articles_blocks_in_the_know_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_in_the_know_order_idx ON public.articles_blocks_in_the_know USING btree (_order);


--
-- Name: articles_blocks_in_the_know_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_in_the_know_parent_id_idx ON public.articles_blocks_in_the_know USING btree (_parent_id);


--
-- Name: articles_blocks_in_the_know_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_in_the_know_path_idx ON public.articles_blocks_in_the_know USING btree (_path);


--
-- Name: articles_blocks_key_takeaway_items_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_key_takeaway_items_order_idx ON public.articles_blocks_key_takeaway_items USING btree (_order);


--
-- Name: articles_blocks_key_takeaway_items_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_key_takeaway_items_parent_id_idx ON public.articles_blocks_key_takeaway_items USING btree (_parent_id);


--
-- Name: articles_blocks_key_takeaway_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_key_takeaway_order_idx ON public.articles_blocks_key_takeaway USING btree (_order);


--
-- Name: articles_blocks_key_takeaway_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_key_takeaway_parent_id_idx ON public.articles_blocks_key_takeaway USING btree (_parent_id);


--
-- Name: articles_blocks_key_takeaway_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_key_takeaway_path_idx ON public.articles_blocks_key_takeaway USING btree (_path);


--
-- Name: articles_blocks_pull_quote_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_pull_quote_order_idx ON public.articles_blocks_pull_quote USING btree (_order);


--
-- Name: articles_blocks_pull_quote_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_pull_quote_parent_id_idx ON public.articles_blocks_pull_quote USING btree (_parent_id);


--
-- Name: articles_blocks_pull_quote_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_pull_quote_path_idx ON public.articles_blocks_pull_quote USING btree (_path);


--
-- Name: articles_blocks_text_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_text_order_idx ON public.articles_blocks_text USING btree (_order);


--
-- Name: articles_blocks_text_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_text_parent_id_idx ON public.articles_blocks_text USING btree (_parent_id);


--
-- Name: articles_blocks_text_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_blocks_text_path_idx ON public.articles_blocks_text USING btree (_path);


--
-- Name: articles_canonical_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX articles_canonical_path_idx ON public.articles USING btree (canonical_path);


--
-- Name: articles_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_category_idx ON public.articles USING btree (category_id);


--
-- Name: articles_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_created_at_idx ON public.articles USING btree (created_at);


--
-- Name: articles_header_section_header_section_featured_image_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_header_section_header_section_featured_image_idx ON public.articles USING btree (header_section_featured_image_id);


--
-- Name: articles_header_section_header_section_featured_media_se_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_header_section_header_section_featured_media_se_idx ON public.articles USING btree (header_section_featured_media_set_id);


--
-- Name: articles_language_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_language_idx ON public.articles USING btree (language);


--
-- Name: articles_location_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_location_ref_idx ON public.articles USING btree (location_ref_id);


--
-- Name: articles_public_author_feed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_public_author_feed_idx ON public.articles USING btree (author_id, language, published_at DESC) WHERE (status = 'published'::public.enum_articles_status);


--
-- Name: articles_public_location_feed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_public_location_feed_idx ON public.articles USING btree (location, language, published_at DESC) WHERE (status = 'published'::public.enum_articles_status);


--
-- Name: articles_public_location_prefix_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_public_location_prefix_idx ON public.articles USING btree (location text_pattern_ops) WHERE (status = 'published'::public.enum_articles_status);


--
-- Name: articles_rels_article_tags_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_rels_article_tags_id_idx ON public.articles_rels USING btree (article_tags_id);


--
-- Name: articles_rels_locations_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_rels_locations_id_idx ON public.articles_rels USING btree (locations_id);


--
-- Name: articles_rels_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_rels_order_idx ON public.articles_rels USING btree ("order");


--
-- Name: articles_rels_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_rels_parent_idx ON public.articles_rels USING btree (parent_id);


--
-- Name: articles_rels_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_rels_path_idx ON public.articles_rels USING btree (path);


--
-- Name: articles_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX articles_slug_idx ON public.articles USING btree (slug);


--
-- Name: articles_source_feature_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_source_feature_idx ON public.articles USING btree (source_feature);


--
-- Name: articles_source_run_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_source_run_id_idx ON public.articles USING btree (source_run_id);


--
-- Name: articles_title_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX articles_title_idx ON public.articles USING btree (title);


--
-- Name: articles_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_updated_at_idx ON public.articles USING btree (updated_at);


--
-- Name: attractions_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attractions_created_at_idx ON public.attractions USING btree (created_at);


--
-- Name: attractions_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attractions_created_by_idx ON public.attractions USING btree (created_by_id);


--
-- Name: attractions_gallery_image_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attractions_gallery_image_idx ON public.attractions_gallery USING btree (image_id);


--
-- Name: attractions_gallery_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attractions_gallery_order_idx ON public.attractions_gallery USING btree (_order);


--
-- Name: attractions_gallery_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attractions_gallery_parent_id_idx ON public.attractions_gallery USING btree (_parent_id);


--
-- Name: attractions_instagram_gallery_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attractions_instagram_gallery_order_idx ON public.attractions_instagram_gallery USING btree (_order);


--
-- Name: attractions_instagram_gallery_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attractions_instagram_gallery_parent_id_idx ON public.attractions_instagram_gallery USING btree (_parent_id);


--
-- Name: attractions_instagram_gallery_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attractions_instagram_gallery_post_idx ON public.attractions_instagram_gallery USING btree (post_id);


--
-- Name: attractions_location_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attractions_location_ref_idx ON public.attractions USING btree (location_ref_id);


--
-- Name: attractions_rels_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attractions_rels_order_idx ON public.attractions_rels USING btree ("order");


--
-- Name: attractions_rels_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attractions_rels_parent_idx ON public.attractions_rels USING btree (parent_id);


--
-- Name: attractions_rels_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attractions_rels_path_idx ON public.attractions_rels USING btree (path);


--
-- Name: attractions_rels_tours_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attractions_rels_tours_id_idx ON public.attractions_rels USING btree (tours_id);


--
-- Name: attractions_title_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX attractions_title_idx ON public.attractions USING btree (title);


--
-- Name: attractions_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attractions_updated_at_idx ON public.attractions USING btree (updated_at);


--
-- Name: authors_article_byline_featured_links_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX authors_article_byline_featured_links_order_idx ON public.authors_article_byline_featured_links USING btree ("order");


--
-- Name: authors_article_byline_featured_links_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX authors_article_byline_featured_links_parent_idx ON public.authors_article_byline_featured_links USING btree (parent_id);


--
-- Name: authors_author_images_media_set_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX authors_author_images_media_set_idx ON public.authors_author_images USING btree (media_set_id);


--
-- Name: authors_author_images_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX authors_author_images_order_idx ON public.authors_author_images USING btree (_order);


--
-- Name: authors_author_images_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX authors_author_images_parent_id_idx ON public.authors_author_images USING btree (_parent_id);


--
-- Name: authors_expertise_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX authors_expertise_parent_id_idx ON public.authors_expertise USING btree (_parent_id);


--
-- Name: authors_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX authors_slug_idx ON public.authors USING btree (slug);


--
-- Name: authors_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX authors_user_idx ON public.authors USING btree (user_id);


--
-- Name: bookmarks_auth_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookmarks_auth_user_id_idx ON public.bookmarks USING btree (auth_user_id);


--
-- Name: bookmarks_auth_user_id_target_type_target_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bookmarks_auth_user_id_target_type_target_id_idx ON public.bookmarks USING btree (auth_user_id, target_type, target_id);


--
-- Name: bookmarks_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookmarks_created_at_idx ON public.bookmarks USING btree (created_at);


--
-- Name: bookmarks_target_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookmarks_target_id_idx ON public.bookmarks USING btree (target_id);


--
-- Name: bookmarks_target_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookmarks_target_type_idx ON public.bookmarks USING btree (target_type);


--
-- Name: bookmarks_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookmarks_updated_at_idx ON public.bookmarks USING btree (updated_at);


--
-- Name: currencies_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX currencies_code_idx ON public.currencies USING btree (code);


--
-- Name: currencies_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX currencies_created_at_idx ON public.currencies USING btree (created_at);


--
-- Name: currencies_regions_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX currencies_regions_order_idx ON public.currencies_regions USING btree ("order");


--
-- Name: currencies_regions_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX currencies_regions_parent_idx ON public.currencies_regions USING btree (parent_id);


--
-- Name: currencies_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX currencies_updated_at_idx ON public.currencies USING btree (updated_at);


--
-- Name: currencies_used_in_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX currencies_used_in_order_idx ON public.currencies_used_in USING btree (_order);


--
-- Name: currencies_used_in_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX currencies_used_in_parent_id_idx ON public.currencies_used_in USING btree (_parent_id);


--
-- Name: dining_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dining_created_at_idx ON public.dining USING btree (created_at);


--
-- Name: dining_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dining_created_by_idx ON public.dining USING btree (created_by_id);


--
-- Name: dining_gallery_image_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dining_gallery_image_idx ON public.dining_gallery USING btree (image_id);


--
-- Name: dining_gallery_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dining_gallery_order_idx ON public.dining_gallery USING btree (_order);


--
-- Name: dining_gallery_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dining_gallery_parent_id_idx ON public.dining_gallery USING btree (_parent_id);


--
-- Name: dining_instagram_gallery_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dining_instagram_gallery_order_idx ON public.dining_instagram_gallery USING btree (_order);


--
-- Name: dining_instagram_gallery_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dining_instagram_gallery_parent_id_idx ON public.dining_instagram_gallery USING btree (_parent_id);


--
-- Name: dining_instagram_gallery_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dining_instagram_gallery_post_idx ON public.dining_instagram_gallery USING btree (post_id);


--
-- Name: dining_location_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dining_location_ref_idx ON public.dining USING btree (location_ref_id);


--
-- Name: dining_title_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX dining_title_idx ON public.dining USING btree (title);


--
-- Name: dining_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dining_updated_at_idx ON public.dining USING btree (updated_at);


--
-- Name: email_logs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_logs_created_at_idx ON public.email_logs USING btree (created_at);


--
-- Name: email_logs_email_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_logs_email_type_idx ON public.email_logs USING btree (email_type);


--
-- Name: email_logs_recipient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_logs_recipient_idx ON public.email_logs USING btree (recipient);


--
-- Name: email_logs_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_logs_updated_at_idx ON public.email_logs USING btree (updated_at);


--
-- Name: instagram_posts_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX instagram_posts_created_at_idx ON public.instagram_posts USING btree (created_at);


--
-- Name: instagram_posts_preview_image_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX instagram_posts_preview_image_idx ON public.instagram_posts USING btree (preview_image_id);


--
-- Name: instagram_posts_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX instagram_posts_updated_at_idx ON public.instagram_posts USING btree (updated_at);


--
-- Name: ita_image_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ita_image_idx ON public.ita USING btree (image_id);


--
-- Name: ita_instagram_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ita_instagram_post_idx ON public.ita USING btree (instagram_post_id);


--
-- Name: ita_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ita_order_idx ON public.ita USING btree (_order);


--
-- Name: ita_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ita_parent_id_idx ON public.ita USING btree (_parent_id);


--
-- Name: ita_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ita_path_idx ON public.ita USING btree (_path);


--
-- Name: key_locations_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX key_locations_created_at_idx ON public.key_locations USING btree (created_at);


--
-- Name: key_locations_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX key_locations_created_by_idx ON public.key_locations USING btree (created_by_id);


--
-- Name: key_locations_gallery_image_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX key_locations_gallery_image_idx ON public.key_locations_gallery USING btree (image_id);


--
-- Name: key_locations_gallery_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX key_locations_gallery_order_idx ON public.key_locations_gallery USING btree (_order);


--
-- Name: key_locations_gallery_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX key_locations_gallery_parent_id_idx ON public.key_locations_gallery USING btree (_parent_id);


--
-- Name: key_locations_instagram_gallery_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX key_locations_instagram_gallery_order_idx ON public.key_locations_instagram_gallery USING btree (_order);


--
-- Name: key_locations_instagram_gallery_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX key_locations_instagram_gallery_parent_id_idx ON public.key_locations_instagram_gallery USING btree (_parent_id);


--
-- Name: key_locations_instagram_gallery_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX key_locations_instagram_gallery_post_idx ON public.key_locations_instagram_gallery USING btree (post_id);


--
-- Name: key_locations_location_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX key_locations_location_ref_idx ON public.key_locations USING btree (location_ref_id);


--
-- Name: key_locations_title_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX key_locations_title_idx ON public.key_locations USING btree (title);


--
-- Name: key_locations_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX key_locations_updated_at_idx ON public.key_locations USING btree (updated_at);


--
-- Name: kls_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kls_order_idx ON public.kls USING btree (_order);


--
-- Name: kls_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kls_parent_id_idx ON public.kls USING btree (_parent_id);


--
-- Name: listicle_itineraries_author_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_author_idx ON public.listicle_itineraries USING btree (author_id);


--
-- Name: listicle_itineraries_blocks_itinerary_accommodations_ite_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_accommodations_ite_idx ON public.listicle_itineraries_blocks_itinerary_accommodations USING btree (item_id);


--
-- Name: listicle_itineraries_blocks_itinerary_accommodations_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_accommodations_order_idx ON public.listicle_itineraries_blocks_itinerary_accommodations USING btree (_order);


--
-- Name: listicle_itineraries_blocks_itinerary_accommodations_parent_id_; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_accommodations_parent_id_ ON public.listicle_itineraries_blocks_itinerary_accommodations USING btree (_parent_id);


--
-- Name: listicle_itineraries_blocks_itinerary_accommodations_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_accommodations_path_idx ON public.listicle_itineraries_blocks_itinerary_accommodations USING btree (_path);


--
-- Name: listicle_itineraries_blocks_itinerary_accommodations_sel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_accommodations_sel_idx ON public.listicle_itineraries_blocks_itinerary_accommodations USING btree (selected_instagram_post_id);


--
-- Name: listicle_itineraries_blocks_itinerary_attractions_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_attractions_item_idx ON public.listicle_itineraries_blocks_itinerary_attractions USING btree (item_id);


--
-- Name: listicle_itineraries_blocks_itinerary_attractions_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_attractions_order_idx ON public.listicle_itineraries_blocks_itinerary_attractions USING btree (_order);


--
-- Name: listicle_itineraries_blocks_itinerary_attractions_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_attractions_parent_id_idx ON public.listicle_itineraries_blocks_itinerary_attractions USING btree (_parent_id);


--
-- Name: listicle_itineraries_blocks_itinerary_attractions_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_attractions_path_idx ON public.listicle_itineraries_blocks_itinerary_attractions USING btree (_path);


--
-- Name: listicle_itineraries_blocks_itinerary_attractions_select_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_attractions_select_idx ON public.listicle_itineraries_blocks_itinerary_attractions USING btree (selected_instagram_post_id);


--
-- Name: listicle_itineraries_blocks_itinerary_dining_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_dining_item_idx ON public.listicle_itineraries_blocks_itinerary_dining USING btree (item_id);


--
-- Name: listicle_itineraries_blocks_itinerary_dining_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_dining_order_idx ON public.listicle_itineraries_blocks_itinerary_dining USING btree (_order);


--
-- Name: listicle_itineraries_blocks_itinerary_dining_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_dining_parent_id_idx ON public.listicle_itineraries_blocks_itinerary_dining USING btree (_parent_id);


--
-- Name: listicle_itineraries_blocks_itinerary_dining_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_dining_path_idx ON public.listicle_itineraries_blocks_itinerary_dining USING btree (_path);


--
-- Name: listicle_itineraries_blocks_itinerary_dining_selected_in_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_dining_selected_in_idx ON public.listicle_itineraries_blocks_itinerary_dining USING btree (selected_instagram_post_id);


--
-- Name: listicle_itineraries_blocks_itinerary_key_location_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_key_location_item_idx ON public.listicle_itineraries_blocks_itinerary_key_location USING btree (item_id);


--
-- Name: listicle_itineraries_blocks_itinerary_key_location_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_key_location_order_idx ON public.listicle_itineraries_blocks_itinerary_key_location USING btree (_order);


--
-- Name: listicle_itineraries_blocks_itinerary_key_location_parent_id_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_key_location_parent_id_id ON public.listicle_itineraries_blocks_itinerary_key_location USING btree (_parent_id);


--
-- Name: listicle_itineraries_blocks_itinerary_key_location_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_key_location_path_idx ON public.listicle_itineraries_blocks_itinerary_key_location USING btree (_path);


--
-- Name: listicle_itineraries_blocks_itinerary_key_location_selec_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_key_location_selec_idx ON public.listicle_itineraries_blocks_itinerary_key_location USING btree (selected_instagram_post_id);


--
-- Name: listicle_itineraries_blocks_itinerary_nightlife_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_nightlife_item_idx ON public.listicle_itineraries_blocks_itinerary_nightlife USING btree (item_id);


--
-- Name: listicle_itineraries_blocks_itinerary_nightlife_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_nightlife_order_idx ON public.listicle_itineraries_blocks_itinerary_nightlife USING btree (_order);


--
-- Name: listicle_itineraries_blocks_itinerary_nightlife_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_nightlife_parent_id_idx ON public.listicle_itineraries_blocks_itinerary_nightlife USING btree (_parent_id);


--
-- Name: listicle_itineraries_blocks_itinerary_nightlife_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_nightlife_path_idx ON public.listicle_itineraries_blocks_itinerary_nightlife USING btree (_path);


--
-- Name: listicle_itineraries_blocks_itinerary_nightlife_selected_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_nightlife_selected_idx ON public.listicle_itineraries_blocks_itinerary_nightlife USING btree (selected_instagram_post_id);


--
-- Name: listicle_itineraries_blocks_itinerary_where_staying_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_where_staying_item_idx ON public.listicle_itineraries_blocks_itinerary_where_staying USING btree (item_id);


--
-- Name: listicle_itineraries_blocks_itinerary_where_staying_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_where_staying_order_idx ON public.listicle_itineraries_blocks_itinerary_where_staying USING btree (_order);


--
-- Name: listicle_itineraries_blocks_itinerary_where_staying_parent_id_i; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_where_staying_parent_id_i ON public.listicle_itineraries_blocks_itinerary_where_staying USING btree (_parent_id);


--
-- Name: listicle_itineraries_blocks_itinerary_where_staying_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_where_staying_path_idx ON public.listicle_itineraries_blocks_itinerary_where_staying USING btree (_path);


--
-- Name: listicle_itineraries_blocks_itinerary_where_staying_sele_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_blocks_itinerary_where_staying_sele_idx ON public.listicle_itineraries_blocks_itinerary_where_staying USING btree (selected_instagram_post_id);


--
-- Name: listicle_itineraries_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_created_at_idx ON public.listicle_itineraries USING btree (created_at);


--
-- Name: listicle_itineraries_header_header_featured_image_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_header_header_featured_image_idx ON public.listicle_itineraries USING btree (header_featured_image_id);


--
-- Name: listicle_itineraries_header_header_featured_media_set_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_header_header_featured_media_set_idx ON public.listicle_itineraries USING btree (header_featured_media_set_id);


--
-- Name: listicle_itineraries_itinerary_days_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_itinerary_days_order_idx ON public.listicle_itineraries_itinerary_days USING btree (_order);


--
-- Name: listicle_itineraries_itinerary_days_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_itinerary_days_parent_id_idx ON public.listicle_itineraries_itinerary_days USING btree (_parent_id);


--
-- Name: listicle_itineraries_language_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_language_idx ON public.listicle_itineraries USING btree (language);


--
-- Name: listicle_itineraries_location_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_location_ref_idx ON public.listicle_itineraries USING btree (location_ref_id);


--
-- Name: listicle_itineraries_public_author_feed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_public_author_feed_idx ON public.listicle_itineraries USING btree (author_id, language, published_at DESC) WHERE (status = 'published'::public.enum_listicle_itineraries_status);


--
-- Name: listicle_itineraries_public_location_feed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_public_location_feed_idx ON public.listicle_itineraries USING btree (location, language, published_at DESC) WHERE (status = 'published'::public.enum_listicle_itineraries_status);


--
-- Name: listicle_itineraries_public_location_prefix_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_public_location_prefix_idx ON public.listicle_itineraries USING btree (location text_pattern_ops) WHERE (status = 'published'::public.enum_listicle_itineraries_status);


--
-- Name: listicle_itineraries_rels_accommodations_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_rels_accommodations_id_idx ON public.listicle_itineraries_rels USING btree (accommodations_id);


--
-- Name: listicle_itineraries_rels_attractions_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_rels_attractions_id_idx ON public.listicle_itineraries_rels USING btree (attractions_id);


--
-- Name: listicle_itineraries_rels_dining_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_rels_dining_id_idx ON public.listicle_itineraries_rels USING btree (dining_id);


--
-- Name: listicle_itineraries_rels_key_locations_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_rels_key_locations_id_idx ON public.listicle_itineraries_rels USING btree (key_locations_id);


--
-- Name: listicle_itineraries_rels_locations_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_rels_locations_id_idx ON public.listicle_itineraries_rels USING btree (locations_id);


--
-- Name: listicle_itineraries_rels_media_sets_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_rels_media_sets_id_idx ON public.listicle_itineraries_rels USING btree (media_sets_id);


--
-- Name: listicle_itineraries_rels_nightlife_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_rels_nightlife_id_idx ON public.listicle_itineraries_rels USING btree (nightlife_id);


--
-- Name: listicle_itineraries_rels_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_rels_order_idx ON public.listicle_itineraries_rels USING btree ("order");


--
-- Name: listicle_itineraries_rels_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_rels_parent_idx ON public.listicle_itineraries_rels USING btree (parent_id);


--
-- Name: listicle_itineraries_rels_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_rels_path_idx ON public.listicle_itineraries_rels USING btree (path);


--
-- Name: listicle_itineraries_rels_tours_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_rels_tours_id_idx ON public.listicle_itineraries_rels USING btree (tours_id);


--
-- Name: listicle_itineraries_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX listicle_itineraries_slug_idx ON public.listicle_itineraries USING btree (slug);


--
-- Name: listicle_itineraries_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listicle_itineraries_updated_at_idx ON public.listicle_itineraries USING btree (updated_at);


--
-- Name: location_homepages_blocks_article_grid_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_article_grid_order_idx ON public.location_homepages_blocks_article_grid USING btree (_order);


--
-- Name: location_homepages_blocks_article_grid_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_article_grid_parent_id_idx ON public.location_homepages_blocks_article_grid USING btree (_parent_id);


--
-- Name: location_homepages_blocks_article_grid_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_article_grid_path_idx ON public.location_homepages_blocks_article_grid USING btree (_path);


--
-- Name: location_homepages_blocks_article_list_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_article_list_order_idx ON public.location_homepages_blocks_article_list USING btree (_order);


--
-- Name: location_homepages_blocks_article_list_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_article_list_parent_id_idx ON public.location_homepages_blocks_article_list USING btree (_parent_id);


--
-- Name: location_homepages_blocks_article_list_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_article_list_path_idx ON public.location_homepages_blocks_article_list USING btree (_path);


--
-- Name: location_homepages_blocks_author_feature_author_cards_au_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_author_feature_author_cards_au_idx ON public.location_homepages_blocks_author_feature_author_cards USING btree (author_id);


--
-- Name: location_homepages_blocks_author_feature_author_cards_im_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_author_feature_author_cards_im_idx ON public.location_homepages_blocks_author_feature_author_cards USING btree (image_id);


--
-- Name: location_homepages_blocks_author_feature_author_cards_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_author_feature_author_cards_order_idx ON public.location_homepages_blocks_author_feature_author_cards USING btree (_order);


--
-- Name: location_homepages_blocks_author_feature_author_cards_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_author_feature_author_cards_parent_id ON public.location_homepages_blocks_author_feature_author_cards USING btree (_parent_id);


--
-- Name: location_homepages_blocks_author_feature_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_author_feature_order_idx ON public.location_homepages_blocks_author_feature USING btree (_order);


--
-- Name: location_homepages_blocks_author_feature_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_author_feature_parent_id_idx ON public.location_homepages_blocks_author_feature USING btree (_parent_id);


--
-- Name: location_homepages_blocks_author_feature_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_author_feature_path_idx ON public.location_homepages_blocks_author_feature USING btree (_path);


--
-- Name: location_homepages_blocks_author_feature_selected_expertise_ord; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_author_feature_selected_expertise_ord ON public.location_homepages_blocks_author_feature_selected_expertise USING btree (_order);


--
-- Name: location_homepages_blocks_author_feature_selected_expertise_par; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_author_feature_selected_expertise_par ON public.location_homepages_blocks_author_feature_selected_expertise USING btree (_parent_id);


--
-- Name: location_homepages_blocks_editorial_feature_feature_medi_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_editorial_feature_feature_medi_idx ON public.location_homepages_blocks_editorial_feature USING btree (feature_media_set_id);


--
-- Name: location_homepages_blocks_editorial_feature_linked_locat_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_editorial_feature_linked_locat_idx ON public.location_homepages_blocks_editorial_feature USING btree (linked_location_id);


--
-- Name: location_homepages_blocks_editorial_feature_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_editorial_feature_order_idx ON public.location_homepages_blocks_editorial_feature USING btree (_order);


--
-- Name: location_homepages_blocks_editorial_feature_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_editorial_feature_parent_id_idx ON public.location_homepages_blocks_editorial_feature USING btree (_parent_id);


--
-- Name: location_homepages_blocks_editorial_feature_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_editorial_feature_path_idx ON public.location_homepages_blocks_editorial_feature USING btree (_path);


--
-- Name: location_homepages_blocks_featured_article_carousel_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_featured_article_carousel_order_idx ON public.location_homepages_blocks_featured_article_carousel USING btree (_order);


--
-- Name: location_homepages_blocks_featured_article_carousel_parent_id_i; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_featured_article_carousel_parent_id_i ON public.location_homepages_blocks_featured_article_carousel USING btree (_parent_id);


--
-- Name: location_homepages_blocks_featured_article_carousel_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_featured_article_carousel_path_idx ON public.location_homepages_blocks_featured_article_carousel USING btree (_path);


--
-- Name: location_homepages_blocks_featured_article_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_featured_article_order_idx ON public.location_homepages_blocks_featured_article USING btree (_order);


--
-- Name: location_homepages_blocks_featured_article_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_featured_article_parent_id_idx ON public.location_homepages_blocks_featured_article USING btree (_parent_id);


--
-- Name: location_homepages_blocks_featured_article_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_featured_article_path_idx ON public.location_homepages_blocks_featured_article USING btree (_path);


--
-- Name: location_homepages_blocks_featured_articles_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_featured_articles_order_idx ON public.location_homepages_blocks_featured_articles USING btree (_order);


--
-- Name: location_homepages_blocks_featured_articles_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_featured_articles_parent_id_idx ON public.location_homepages_blocks_featured_articles USING btree (_parent_id);


--
-- Name: location_homepages_blocks_featured_articles_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_featured_articles_path_idx ON public.location_homepages_blocks_featured_articles USING btree (_path);


--
-- Name: location_homepages_blocks_featured_creator_article_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_featured_creator_article_order_idx ON public.location_homepages_blocks_featured_creator_article USING btree (_order);


--
-- Name: location_homepages_blocks_featured_creator_article_parent_id_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_featured_creator_article_parent_id_id ON public.location_homepages_blocks_featured_creator_article USING btree (_parent_id);


--
-- Name: location_homepages_blocks_featured_creator_article_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_featured_creator_article_path_idx ON public.location_homepages_blocks_featured_creator_article USING btree (_path);


--
-- Name: location_homepages_blocks_hotel_grid_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_hotel_grid_order_idx ON public.location_homepages_blocks_hotel_grid USING btree (_order);


--
-- Name: location_homepages_blocks_hotel_grid_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_hotel_grid_parent_id_idx ON public.location_homepages_blocks_hotel_grid USING btree (_parent_id);


--
-- Name: location_homepages_blocks_hotel_grid_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_hotel_grid_path_idx ON public.location_homepages_blocks_hotel_grid USING btree (_path);


--
-- Name: location_homepages_blocks_location_grid_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_location_grid_order_idx ON public.location_homepages_blocks_location_grid USING btree (_order);


--
-- Name: location_homepages_blocks_location_grid_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_location_grid_parent_id_idx ON public.location_homepages_blocks_location_grid USING btree (_parent_id);


--
-- Name: location_homepages_blocks_location_grid_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_location_grid_path_idx ON public.location_homepages_blocks_location_grid USING btree (_path);


--
-- Name: location_homepages_blocks_newsletter_signup_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_newsletter_signup_order_idx ON public.location_homepages_blocks_newsletter_signup USING btree (_order);


--
-- Name: location_homepages_blocks_newsletter_signup_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_newsletter_signup_parent_id_idx ON public.location_homepages_blocks_newsletter_signup USING btree (_parent_id);


--
-- Name: location_homepages_blocks_newsletter_signup_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_newsletter_signup_path_idx ON public.location_homepages_blocks_newsletter_signup USING btree (_path);


--
-- Name: location_homepages_blocks_questurian_maps_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_questurian_maps_order_idx ON public.location_homepages_blocks_questurian_maps USING btree (_order);


--
-- Name: location_homepages_blocks_questurian_maps_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_questurian_maps_parent_id_idx ON public.location_homepages_blocks_questurian_maps USING btree (_parent_id);


--
-- Name: location_homepages_blocks_questurian_maps_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_questurian_maps_path_idx ON public.location_homepages_blocks_questurian_maps USING btree (_path);


--
-- Name: location_homepages_blocks_things_to_do_attractions_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_things_to_do_attractions_order_idx ON public.location_homepages_blocks_things_to_do_attractions USING btree (_order);


--
-- Name: location_homepages_blocks_things_to_do_attractions_parent_id_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_things_to_do_attractions_parent_id_id ON public.location_homepages_blocks_things_to_do_attractions USING btree (_parent_id);


--
-- Name: location_homepages_blocks_things_to_do_attractions_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_things_to_do_attractions_path_idx ON public.location_homepages_blocks_things_to_do_attractions USING btree (_path);


--
-- Name: location_homepages_blocks_things_to_do_listicles_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_things_to_do_listicles_order_idx ON public.location_homepages_blocks_things_to_do_listicles USING btree (_order);


--
-- Name: location_homepages_blocks_things_to_do_listicles_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_things_to_do_listicles_parent_id_idx ON public.location_homepages_blocks_things_to_do_listicles USING btree (_parent_id);


--
-- Name: location_homepages_blocks_things_to_do_listicles_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_things_to_do_listicles_path_idx ON public.location_homepages_blocks_things_to_do_listicles USING btree (_path);


--
-- Name: location_homepages_blocks_tour_grid_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_tour_grid_order_idx ON public.location_homepages_blocks_tour_grid USING btree (_order);


--
-- Name: location_homepages_blocks_tour_grid_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_tour_grid_parent_id_idx ON public.location_homepages_blocks_tour_grid USING btree (_parent_id);


--
-- Name: location_homepages_blocks_tour_grid_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_tour_grid_path_idx ON public.location_homepages_blocks_tour_grid USING btree (_path);


--
-- Name: location_homepages_blocks_where_to_eat_drink_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_where_to_eat_drink_order_idx ON public.location_homepages_blocks_where_to_eat_drink USING btree (_order);


--
-- Name: location_homepages_blocks_where_to_eat_drink_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_where_to_eat_drink_parent_id_idx ON public.location_homepages_blocks_where_to_eat_drink USING btree (_parent_id);


--
-- Name: location_homepages_blocks_where_to_eat_drink_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_blocks_where_to_eat_drink_path_idx ON public.location_homepages_blocks_where_to_eat_drink USING btree (_path);


--
-- Name: location_homepages_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_created_at_idx ON public.location_homepages USING btree (created_at);


--
-- Name: location_homepages_last_published_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_last_published_by_idx ON public.location_homepages USING btree (last_published_by_id);


--
-- Name: location_homepages_location_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_location_idx ON public.location_homepages USING btree (location_id);


--
-- Name: location_homepages_rels_accommodations_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_rels_accommodations_id_idx ON public.location_homepages_rels USING btree (accommodations_id);


--
-- Name: location_homepages_rels_articles_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_rels_articles_id_idx ON public.location_homepages_rels USING btree (articles_id);


--
-- Name: location_homepages_rels_attractions_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_rels_attractions_id_idx ON public.location_homepages_rels USING btree (attractions_id);


--
-- Name: location_homepages_rels_listicle_itineraries_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_rels_listicle_itineraries_id_idx ON public.location_homepages_rels USING btree (listicle_itineraries_id);


--
-- Name: location_homepages_rels_locations_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_rels_locations_id_idx ON public.location_homepages_rels USING btree (locations_id);


--
-- Name: location_homepages_rels_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_rels_order_idx ON public.location_homepages_rels USING btree ("order");


--
-- Name: location_homepages_rels_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_rels_parent_idx ON public.location_homepages_rels USING btree (parent_id);


--
-- Name: location_homepages_rels_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_rels_path_idx ON public.location_homepages_rels USING btree (path);


--
-- Name: location_homepages_rels_single_type_listicles_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_rels_single_type_listicles_id_idx ON public.location_homepages_rels USING btree (single_type_listicles_id);


--
-- Name: location_homepages_rels_tours_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_rels_tours_id_idx ON public.location_homepages_rels USING btree (tours_id);


--
-- Name: location_homepages_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX location_homepages_updated_at_idx ON public.location_homepages USING btree (updated_at);


--
-- Name: locations_cover_image_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX locations_cover_image_idx ON public.locations USING btree (cover_image_id);


--
-- Name: locations_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX locations_created_at_idx ON public.locations USING btree (created_at);


--
-- Name: locations_location_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX locations_location_key_idx ON public.locations USING btree (location_key);


--
-- Name: locations_parent_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX locations_parent_key_idx ON public.locations USING btree (parent_key);


--
-- Name: locations_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX locations_updated_at_idx ON public.locations USING btree (updated_at);


--
-- Name: main_homepage_last_published_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX main_homepage_last_published_by_idx ON public.main_homepage USING btree (last_published_by_id);


--
-- Name: media_assets_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_assets_created_at_idx ON public.media_assets USING btree (created_at);


--
-- Name: media_assets_filename_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX media_assets_filename_idx ON public.media_assets USING btree (filename);


--
-- Name: media_assets_location_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_assets_location_ref_idx ON public.media_assets USING btree (location_ref_id);


--
-- Name: media_assets_media_set_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_assets_media_set_idx ON public.media_assets USING btree (media_set_id);


--
-- Name: media_assets_rels_article_tags_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_assets_rels_article_tags_id_idx ON public.media_assets_rels USING btree (article_tags_id);


--
-- Name: media_assets_rels_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_assets_rels_order_idx ON public.media_assets_rels USING btree ("order");


--
-- Name: media_assets_rels_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_assets_rels_parent_idx ON public.media_assets_rels USING btree (parent_id);


--
-- Name: media_assets_rels_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_assets_rels_path_idx ON public.media_assets_rels USING btree (path);


--
-- Name: media_assets_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_assets_updated_at_idx ON public.media_assets USING btree (updated_at);


--
-- Name: media_assets_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_assets_user_idx ON public.media_assets USING btree (user_id);


--
-- Name: media_sets_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_sets_created_at_idx ON public.media_sets USING btree (created_at);


--
-- Name: media_sets_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_sets_created_by_idx ON public.media_sets USING btree (created_by_id);


--
-- Name: media_sets_external_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX media_sets_external_ref_idx ON public.media_sets USING btree (external_ref);


--
-- Name: media_sets_location_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_sets_location_ref_idx ON public.media_sets USING btree (location_ref_id);


--
-- Name: media_sets_rels_article_tags_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_sets_rels_article_tags_id_idx ON public.media_sets_rels USING btree (article_tags_id);


--
-- Name: media_sets_rels_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_sets_rels_order_idx ON public.media_sets_rels USING btree ("order");


--
-- Name: media_sets_rels_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_sets_rels_parent_idx ON public.media_sets_rels USING btree (parent_id);


--
-- Name: media_sets_rels_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_sets_rels_path_idx ON public.media_sets_rels USING btree (path);


--
-- Name: media_sets_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_sets_source_idx ON public.media_sets USING btree (source_id);


--
-- Name: media_sets_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_sets_updated_at_idx ON public.media_sets USING btree (updated_at);


--
-- Name: media_sets_variants_variants_editorial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_sets_variants_variants_editorial_idx ON public.media_sets USING btree (variants_editorial_id);


--
-- Name: media_sets_variants_variants_hero_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_sets_variants_variants_hero_idx ON public.media_sets USING btree (variants_hero_id);


--
-- Name: media_sets_variants_variants_open_graph_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_sets_variants_variants_open_graph_idx ON public.media_sets USING btree (variants_open_graph_id);


--
-- Name: media_sets_variants_variants_portrait_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_sets_variants_variants_portrait_idx ON public.media_sets USING btree (variants_portrait_id);


--
-- Name: media_sets_variants_variants_square_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_sets_variants_variants_square_idx ON public.media_sets USING btree (variants_square_id);


--
-- Name: media_sets_variants_variants_thumbnail_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_sets_variants_variants_thumbnail_idx ON public.media_sets USING btree (variants_thumbnail_id);


--
-- Name: media_sets_variants_variants_wide_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_sets_variants_variants_wide_idx ON public.media_sets USING btree (variants_wide_id);


--
-- Name: nightlife_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nightlife_created_at_idx ON public.nightlife USING btree (created_at);


--
-- Name: nightlife_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nightlife_created_by_idx ON public.nightlife USING btree (created_by_id);


--
-- Name: nightlife_gallery_image_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nightlife_gallery_image_idx ON public.nightlife_gallery USING btree (image_id);


--
-- Name: nightlife_gallery_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nightlife_gallery_order_idx ON public.nightlife_gallery USING btree (_order);


--
-- Name: nightlife_gallery_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nightlife_gallery_parent_id_idx ON public.nightlife_gallery USING btree (_parent_id);


--
-- Name: nightlife_instagram_gallery_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nightlife_instagram_gallery_order_idx ON public.nightlife_instagram_gallery USING btree (_order);


--
-- Name: nightlife_instagram_gallery_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nightlife_instagram_gallery_parent_id_idx ON public.nightlife_instagram_gallery USING btree (_parent_id);


--
-- Name: nightlife_instagram_gallery_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nightlife_instagram_gallery_post_idx ON public.nightlife_instagram_gallery USING btree (post_id);


--
-- Name: nightlife_location_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nightlife_location_ref_idx ON public.nightlife USING btree (location_ref_id);


--
-- Name: nightlife_texts_order_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nightlife_texts_order_parent ON public.nightlife_texts USING btree ("order", parent_id);


--
-- Name: nightlife_title_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX nightlife_title_idx ON public.nightlife USING btree (title);


--
-- Name: nightlife_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nightlife_updated_at_idx ON public.nightlife USING btree (updated_at);


--
-- Name: payload_kv_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payload_kv_key_idx ON public.payload_kv USING btree (key);


--
-- Name: payload_locked_documents_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_created_at_idx ON public.payload_locked_documents USING btree (created_at);


--
-- Name: payload_locked_documents_global_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_global_slug_idx ON public.payload_locked_documents USING btree (global_slug);


--
-- Name: payload_locked_documents_rels_accommodations_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_accommodations_id_idx ON public.payload_locked_documents_rels USING btree (accommodations_id);


--
-- Name: payload_locked_documents_rels_affiliate_products_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_affiliate_products_id_idx ON public.payload_locked_documents_rels USING btree (affiliate_products_id);


--
-- Name: payload_locked_documents_rels_article_categories_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_article_categories_id_idx ON public.payload_locked_documents_rels USING btree (article_categories_id);


--
-- Name: payload_locked_documents_rels_article_redirects_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_article_redirects_id_idx ON public.payload_locked_documents_rels USING btree (article_redirects_id);


--
-- Name: payload_locked_documents_rels_article_tags_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_article_tags_id_idx ON public.payload_locked_documents_rels USING btree (article_tags_id);


--
-- Name: payload_locked_documents_rels_articles_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_articles_id_idx ON public.payload_locked_documents_rels USING btree (articles_id);


--
-- Name: payload_locked_documents_rels_attractions_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_attractions_id_idx ON public.payload_locked_documents_rels USING btree (attractions_id);


--
-- Name: payload_locked_documents_rels_authors_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_authors_id_idx ON public.payload_locked_documents_rels USING btree (authors_id);


--
-- Name: payload_locked_documents_rels_bookmarks_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_bookmarks_id_idx ON public.payload_locked_documents_rels USING btree (bookmarks_id);


--
-- Name: payload_locked_documents_rels_currencies_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_currencies_id_idx ON public.payload_locked_documents_rels USING btree (currencies_id);


--
-- Name: payload_locked_documents_rels_dining_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_dining_id_idx ON public.payload_locked_documents_rels USING btree (dining_id);


--
-- Name: payload_locked_documents_rels_instagram_posts_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_instagram_posts_id_idx ON public.payload_locked_documents_rels USING btree (instagram_posts_id);


--
-- Name: payload_locked_documents_rels_key_locations_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_key_locations_id_idx ON public.payload_locked_documents_rels USING btree (key_locations_id);


--
-- Name: payload_locked_documents_rels_listicle_itineraries_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_listicle_itineraries_id_idx ON public.payload_locked_documents_rels USING btree (listicle_itineraries_id);


--
-- Name: payload_locked_documents_rels_location_homepages_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_location_homepages_id_idx ON public.payload_locked_documents_rels USING btree (location_homepages_id);


--
-- Name: payload_locked_documents_rels_locations_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_locations_id_idx ON public.payload_locked_documents_rels USING btree (locations_id);


--
-- Name: payload_locked_documents_rels_media_assets_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_media_assets_id_idx ON public.payload_locked_documents_rels USING btree (media_assets_id);


--
-- Name: payload_locked_documents_rels_media_sets_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_media_sets_id_idx ON public.payload_locked_documents_rels USING btree (media_sets_id);


--
-- Name: payload_locked_documents_rels_nightlife_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_nightlife_id_idx ON public.payload_locked_documents_rels USING btree (nightlife_id);


--
-- Name: payload_locked_documents_rels_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_order_idx ON public.payload_locked_documents_rels USING btree ("order");


--
-- Name: payload_locked_documents_rels_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_parent_idx ON public.payload_locked_documents_rels USING btree (parent_id);


--
-- Name: payload_locked_documents_rels_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_path_idx ON public.payload_locked_documents_rels USING btree (path);


--
-- Name: payload_locked_documents_rels_perfect_for_tags_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_perfect_for_tags_id_idx ON public.payload_locked_documents_rels USING btree (perfect_for_tags_id);


--
-- Name: payload_locked_documents_rels_refresh_jobs_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_refresh_jobs_id_idx ON public.payload_locked_documents_rels USING btree (refresh_jobs_id);


--
-- Name: payload_locked_documents_rels_service_accounts_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_service_accounts_id_idx ON public.payload_locked_documents_rels USING btree (service_accounts_id);


--
-- Name: payload_locked_documents_rels_single_type_listicles_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_single_type_listicles_id_idx ON public.payload_locked_documents_rels USING btree (single_type_listicles_id);


--
-- Name: payload_locked_documents_rels_stripe_webhook_events_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_stripe_webhook_events_id_idx ON public.payload_locked_documents_rels USING btree (stripe_webhook_events_id);


--
-- Name: payload_locked_documents_rels_tours_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_tours_id_idx ON public.payload_locked_documents_rels USING btree (tours_id);


--
-- Name: payload_locked_documents_rels_users_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_users_id_idx ON public.payload_locked_documents_rels USING btree (users_id);


--
-- Name: payload_locked_documents_rels_visitor_profiles_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_visitor_profiles_id_idx ON public.payload_locked_documents_rels USING btree (visitor_profiles_id);


--
-- Name: payload_locked_documents_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_updated_at_idx ON public.payload_locked_documents USING btree (updated_at);


--
-- Name: payload_migrations_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_migrations_created_at_idx ON public.payload_migrations USING btree (created_at);


--
-- Name: payload_migrations_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_migrations_updated_at_idx ON public.payload_migrations USING btree (updated_at);


--
-- Name: payload_preferences_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_preferences_created_at_idx ON public.payload_preferences USING btree (created_at);


--
-- Name: payload_preferences_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_preferences_key_idx ON public.payload_preferences USING btree (key);


--
-- Name: payload_preferences_rels_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_preferences_rels_order_idx ON public.payload_preferences_rels USING btree ("order");


--
-- Name: payload_preferences_rels_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_preferences_rels_parent_idx ON public.payload_preferences_rels USING btree (parent_id);


--
-- Name: payload_preferences_rels_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_preferences_rels_path_idx ON public.payload_preferences_rels USING btree (path);


--
-- Name: payload_preferences_rels_service_accounts_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_preferences_rels_service_accounts_id_idx ON public.payload_preferences_rels USING btree (service_accounts_id);


--
-- Name: payload_preferences_rels_users_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_preferences_rels_users_id_idx ON public.payload_preferences_rels USING btree (users_id);


--
-- Name: payload_preferences_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_preferences_updated_at_idx ON public.payload_preferences USING btree (updated_at);


--
-- Name: perfect_for_tags_applicable_types_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX perfect_for_tags_applicable_types_order_idx ON public.perfect_for_tags_applicable_types USING btree ("order");


--
-- Name: perfect_for_tags_applicable_types_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX perfect_for_tags_applicable_types_parent_idx ON public.perfect_for_tags_applicable_types USING btree (parent_id);


--
-- Name: perfect_for_tags_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX perfect_for_tags_created_at_idx ON public.perfect_for_tags USING btree (created_at);


--
-- Name: perfect_for_tags_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX perfect_for_tags_created_by_idx ON public.perfect_for_tags USING btree (created_by_id);


--
-- Name: perfect_for_tags_label_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX perfect_for_tags_label_idx ON public.perfect_for_tags USING btree (label);


--
-- Name: perfect_for_tags_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX perfect_for_tags_slug_idx ON public.perfect_for_tags USING btree (slug);


--
-- Name: perfect_for_tags_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX perfect_for_tags_updated_at_idx ON public.perfect_for_tags USING btree (updated_at);


--
-- Name: public_search_documents_document_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX public_search_documents_document_idx ON public.public_search_documents USING gin (document);


--
-- Name: public_search_documents_language_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX public_search_documents_language_idx ON public.public_search_documents USING btree (language, published_at DESC);


--
-- Name: public_search_documents_phrase_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX public_search_documents_phrase_trgm_idx ON public.public_search_documents USING gin (phrase_text public.gin_trgm_ops);


--
-- Name: refresh_jobs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refresh_jobs_created_at_idx ON public.refresh_jobs USING btree (created_at);


--
-- Name: refresh_jobs_dedupe_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX refresh_jobs_dedupe_key_idx ON public.refresh_jobs USING btree (dedupe_key);


--
-- Name: refresh_jobs_next_attempt_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refresh_jobs_next_attempt_at_idx ON public.refresh_jobs USING btree (next_attempt_at);


--
-- Name: refresh_jobs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refresh_jobs_status_idx ON public.refresh_jobs USING btree (status);


--
-- Name: refresh_jobs_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refresh_jobs_updated_at_idx ON public.refresh_jobs USING btree (updated_at);


--
-- Name: service_accounts_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_accounts_created_at_idx ON public.service_accounts USING btree (created_at);


--
-- Name: service_accounts_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX service_accounts_name_idx ON public.service_accounts USING btree (name);


--
-- Name: service_accounts_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_accounts_updated_at_idx ON public.service_accounts USING btree (updated_at);


--
-- Name: single_type_listicles_author_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_author_idx ON public.single_type_listicles USING btree (author_id);


--
-- Name: single_type_listicles_blocks_data_accommodations_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_blocks_data_accommodations_item_idx ON public.single_type_listicles_blocks_data_accommodations USING btree (item_id);


--
-- Name: single_type_listicles_blocks_data_accommodations_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_blocks_data_accommodations_order_idx ON public.single_type_listicles_blocks_data_accommodations USING btree (_order);


--
-- Name: single_type_listicles_blocks_data_accommodations_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_blocks_data_accommodations_parent_id_idx ON public.single_type_listicles_blocks_data_accommodations USING btree (_parent_id);


--
-- Name: single_type_listicles_blocks_data_accommodations_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_blocks_data_accommodations_path_idx ON public.single_type_listicles_blocks_data_accommodations USING btree (_path);


--
-- Name: single_type_listicles_blocks_data_accommodations_selecte_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_blocks_data_accommodations_selecte_idx ON public.single_type_listicles_blocks_data_accommodations USING btree (selected_instagram_post_id);


--
-- Name: single_type_listicles_blocks_data_attractions_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_blocks_data_attractions_item_idx ON public.single_type_listicles_blocks_data_attractions USING btree (item_id);


--
-- Name: single_type_listicles_blocks_data_attractions_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_blocks_data_attractions_order_idx ON public.single_type_listicles_blocks_data_attractions USING btree (_order);


--
-- Name: single_type_listicles_blocks_data_attractions_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_blocks_data_attractions_parent_id_idx ON public.single_type_listicles_blocks_data_attractions USING btree (_parent_id);


--
-- Name: single_type_listicles_blocks_data_attractions_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_blocks_data_attractions_path_idx ON public.single_type_listicles_blocks_data_attractions USING btree (_path);


--
-- Name: single_type_listicles_blocks_data_attractions_selected_i_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_blocks_data_attractions_selected_i_idx ON public.single_type_listicles_blocks_data_attractions USING btree (selected_instagram_post_id);


--
-- Name: single_type_listicles_blocks_data_dining_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_blocks_data_dining_item_idx ON public.single_type_listicles_blocks_data_dining USING btree (item_id);


--
-- Name: single_type_listicles_blocks_data_dining_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_blocks_data_dining_order_idx ON public.single_type_listicles_blocks_data_dining USING btree (_order);


--
-- Name: single_type_listicles_blocks_data_dining_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_blocks_data_dining_parent_id_idx ON public.single_type_listicles_blocks_data_dining USING btree (_parent_id);


--
-- Name: single_type_listicles_blocks_data_dining_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_blocks_data_dining_path_idx ON public.single_type_listicles_blocks_data_dining USING btree (_path);


--
-- Name: single_type_listicles_blocks_data_dining_selected_instag_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_blocks_data_dining_selected_instag_idx ON public.single_type_listicles_blocks_data_dining USING btree (selected_instagram_post_id);


--
-- Name: single_type_listicles_blocks_data_nightlife_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_blocks_data_nightlife_item_idx ON public.single_type_listicles_blocks_data_nightlife USING btree (item_id);


--
-- Name: single_type_listicles_blocks_data_nightlife_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_blocks_data_nightlife_order_idx ON public.single_type_listicles_blocks_data_nightlife USING btree (_order);


--
-- Name: single_type_listicles_blocks_data_nightlife_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_blocks_data_nightlife_parent_id_idx ON public.single_type_listicles_blocks_data_nightlife USING btree (_parent_id);


--
-- Name: single_type_listicles_blocks_data_nightlife_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_blocks_data_nightlife_path_idx ON public.single_type_listicles_blocks_data_nightlife USING btree (_path);


--
-- Name: single_type_listicles_blocks_data_nightlife_selected_ins_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_blocks_data_nightlife_selected_ins_idx ON public.single_type_listicles_blocks_data_nightlife USING btree (selected_instagram_post_id);


--
-- Name: single_type_listicles_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_created_at_idx ON public.single_type_listicles USING btree (created_at);


--
-- Name: single_type_listicles_header_header_featured_image_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_header_header_featured_image_idx ON public.single_type_listicles USING btree (header_featured_image_id);


--
-- Name: single_type_listicles_header_header_featured_media_set_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_header_header_featured_media_set_idx ON public.single_type_listicles USING btree (header_featured_media_set_id);


--
-- Name: single_type_listicles_language_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_language_idx ON public.single_type_listicles USING btree (language);


--
-- Name: single_type_listicles_location_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_location_ref_idx ON public.single_type_listicles USING btree (location_ref_id);


--
-- Name: single_type_listicles_public_author_feed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_public_author_feed_idx ON public.single_type_listicles USING btree (author_id, language, published_at DESC) WHERE (status = 'published'::public.enum_single_type_listicles_status);


--
-- Name: single_type_listicles_public_location_feed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_public_location_feed_idx ON public.single_type_listicles USING btree (location, language, published_at DESC) WHERE (status = 'published'::public.enum_single_type_listicles_status);


--
-- Name: single_type_listicles_public_location_prefix_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_public_location_prefix_idx ON public.single_type_listicles USING btree (location text_pattern_ops) WHERE (status = 'published'::public.enum_single_type_listicles_status);


--
-- Name: single_type_listicles_rels_locations_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_rels_locations_id_idx ON public.single_type_listicles_rels USING btree (locations_id);


--
-- Name: single_type_listicles_rels_media_sets_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_rels_media_sets_id_idx ON public.single_type_listicles_rels USING btree (media_sets_id);


--
-- Name: single_type_listicles_rels_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_rels_order_idx ON public.single_type_listicles_rels USING btree ("order");


--
-- Name: single_type_listicles_rels_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_rels_parent_idx ON public.single_type_listicles_rels USING btree (parent_id);


--
-- Name: single_type_listicles_rels_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_rels_path_idx ON public.single_type_listicles_rels USING btree (path);


--
-- Name: single_type_listicles_rels_tours_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_rels_tours_id_idx ON public.single_type_listicles_rels USING btree (tours_id);


--
-- Name: single_type_listicles_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX single_type_listicles_slug_idx ON public.single_type_listicles USING btree (slug);


--
-- Name: single_type_listicles_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX single_type_listicles_updated_at_idx ON public.single_type_listicles USING btree (updated_at);


--
-- Name: stripe_webhook_events_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stripe_webhook_events_created_at_idx ON public.stripe_webhook_events USING btree (created_at);


--
-- Name: stripe_webhook_events_event_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stripe_webhook_events_event_created_idx ON public.stripe_webhook_events USING btree (event_created);


--
-- Name: stripe_webhook_events_event_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX stripe_webhook_events_event_id_idx ON public.stripe_webhook_events USING btree (event_id);


--
-- Name: stripe_webhook_events_subscription_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stripe_webhook_events_subscription_id_idx ON public.stripe_webhook_events USING btree (subscription_id);


--
-- Name: stripe_webhook_events_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stripe_webhook_events_updated_at_idx ON public.stripe_webhook_events USING btree (updated_at);


--
-- Name: tours_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tours_created_at_idx ON public.tours USING btree (created_at);


--
-- Name: tours_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tours_created_by_idx ON public.tours USING btree (created_by_id);


--
-- Name: tours_img_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tours_img_idx ON public.tours USING btree (img_id);


--
-- Name: tours_location_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tours_location_ref_idx ON public.tours USING btree (location_ref_id);


--
-- Name: tours_title_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tours_title_idx ON public.tours USING btree (title);


--
-- Name: tours_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tours_updated_at_idx ON public.tours USING btree (updated_at);


--
-- Name: users_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_created_at_idx ON public.users USING btree (created_at);


--
-- Name: users_email_1_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_1_idx ON public.users USING btree (email);


--
-- Name: users_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_idx ON public.users USING btree (email);


--
-- Name: users_sessions_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_sessions_order_idx ON public.users_sessions USING btree (_order);


--
-- Name: users_sessions_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_sessions_parent_id_idx ON public.users_sessions USING btree (_parent_id);


--
-- Name: users_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_updated_at_idx ON public.users USING btree (updated_at);


--
-- Name: visitor_auth_accounts_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "visitor_auth_accounts_userId_idx" ON public.visitor_auth_accounts USING btree ("userId");


--
-- Name: visitor_auth_sessions_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "visitor_auth_sessions_userId_idx" ON public.visitor_auth_sessions USING btree ("userId");


--
-- Name: visitor_auth_verifications_identifier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visitor_auth_verifications_identifier_idx ON public.visitor_auth_verifications USING btree (identifier);


--
-- Name: visitor_profiles_auth_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX visitor_profiles_auth_user_id_idx ON public.visitor_profiles USING btree (auth_user_id);


--
-- Name: visitor_profiles_billing_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visitor_profiles_billing_email_idx ON public.visitor_profiles USING btree (billing_email);


--
-- Name: visitor_profiles_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visitor_profiles_created_at_idx ON public.visitor_profiles USING btree (created_at);


--
-- Name: visitor_profiles_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visitor_profiles_email_idx ON public.visitor_profiles USING btree (email);


--
-- Name: visitor_profiles_paid_through_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visitor_profiles_paid_through_at_idx ON public.visitor_profiles USING btree (paid_through_at);


--
-- Name: visitor_profiles_stripe_customer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visitor_profiles_stripe_customer_id_idx ON public.visitor_profiles USING btree (stripe_customer_id);


--
-- Name: visitor_profiles_stripe_customer_id_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX visitor_profiles_stripe_customer_id_unique_idx ON public.visitor_profiles USING btree (stripe_customer_id);


--
-- Name: visitor_profiles_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visitor_profiles_updated_at_idx ON public.visitor_profiles USING btree (updated_at);


--
-- Name: users users_identity_email_owner; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER users_identity_email_owner AFTER INSERT OR DELETE OR UPDATE OF email ON public.users FOR EACH ROW EXECUTE FUNCTION public.sync_identity_email_owner('staff');


--
-- Name: visitor_auth_users visitor_auth_users_identity_email_owner; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER visitor_auth_users_identity_email_owner AFTER INSERT OR DELETE OR UPDATE OF email ON public.visitor_auth_users FOR EACH ROW EXECUTE FUNCTION public.sync_identity_email_owner('visitor');


--
-- Name: accommodations accommodations_created_by_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations
    ADD CONSTRAINT accommodations_created_by_id_users_id_fk FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: accommodations_gallery accommodations_gallery_image_id_media_sets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations_gallery
    ADD CONSTRAINT accommodations_gallery_image_id_media_sets_id_fk FOREIGN KEY (image_id) REFERENCES public.media_sets(id) ON DELETE SET NULL;


--
-- Name: accommodations_gallery accommodations_gallery_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations_gallery
    ADD CONSTRAINT accommodations_gallery_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.accommodations(id) ON DELETE CASCADE;


--
-- Name: accommodations_instagram_gallery accommodations_instagram_gallery_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations_instagram_gallery
    ADD CONSTRAINT accommodations_instagram_gallery_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.accommodations(id) ON DELETE CASCADE;


--
-- Name: accommodations_instagram_gallery accommodations_instagram_gallery_post_id_instagram_posts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations_instagram_gallery
    ADD CONSTRAINT accommodations_instagram_gallery_post_id_instagram_posts_id_fk FOREIGN KEY (post_id) REFERENCES public.instagram_posts(id) ON DELETE SET NULL;


--
-- Name: accommodations accommodations_location_ref_id_locations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations
    ADD CONSTRAINT accommodations_location_ref_id_locations_id_fk FOREIGN KEY (location_ref_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: accommodations_the_experience_jacuzzi accommodations_the_experience_jacuzzi_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations_the_experience_jacuzzi
    ADD CONSTRAINT accommodations_the_experience_jacuzzi_parent_fk FOREIGN KEY (parent_id) REFERENCES public.accommodations(id) ON DELETE CASCADE;


--
-- Name: accommodations_the_experience_pool accommodations_the_experience_pool_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations_the_experience_pool
    ADD CONSTRAINT accommodations_the_experience_pool_parent_fk FOREIGN KEY (parent_id) REFERENCES public.accommodations(id) ON DELETE CASCADE;


--
-- Name: accommodations_the_experience_vibe accommodations_the_experience_vibe_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations_the_experience_vibe
    ADD CONSTRAINT accommodations_the_experience_vibe_parent_fk FOREIGN KEY (parent_id) REFERENCES public.accommodations(id) ON DELETE CASCADE;


--
-- Name: accommodations_the_stay_parking accommodations_the_stay_parking_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations_the_stay_parking
    ADD CONSTRAINT accommodations_the_stay_parking_parent_fk FOREIGN KEY (parent_id) REFERENCES public.accommodations(id) ON DELETE CASCADE;


--
-- Name: accommodations_the_stay_perfect_for accommodations_the_stay_perfect_for_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodations_the_stay_perfect_for
    ADD CONSTRAINT accommodations_the_stay_perfect_for_parent_fk FOREIGN KEY (parent_id) REFERENCES public.accommodations(id) ON DELETE CASCADE;


--
-- Name: affiliate_products affiliate_products_created_by_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_products
    ADD CONSTRAINT affiliate_products_created_by_id_users_id_fk FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: affiliate_products affiliate_products_featured_image_id_media_assets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_products
    ADD CONSTRAINT affiliate_products_featured_image_id_media_assets_id_fk FOREIGN KEY (featured_image_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: article_categories article_categories_created_by_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_categories
    ADD CONSTRAINT article_categories_created_by_id_users_id_fk FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: article_redirects article_redirects_article_id_articles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_redirects
    ADD CONSTRAINT article_redirects_article_id_articles_id_fk FOREIGN KEY (article_id) REFERENCES public.articles(id) ON DELETE SET NULL;


--
-- Name: article_tags article_tags_created_by_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_tags
    ADD CONSTRAINT article_tags_created_by_id_users_id_fk FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: articles articles_author_id_authors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_author_id_authors_id_fk FOREIGN KEY (author_id) REFERENCES public.authors(id) ON DELETE RESTRICT;


--
-- Name: articles_blocks_faq_items articles_blocks_faq_items_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_faq_items
    ADD CONSTRAINT articles_blocks_faq_items_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.articles_blocks_faq(id) ON DELETE CASCADE;


--
-- Name: articles_blocks_faq articles_blocks_faq_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_faq
    ADD CONSTRAINT articles_blocks_faq_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.articles(id) ON DELETE CASCADE;


--
-- Name: articles_blocks_highlight_callout articles_blocks_highlight_callout_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_highlight_callout
    ADD CONSTRAINT articles_blocks_highlight_callout_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.articles(id) ON DELETE CASCADE;


--
-- Name: articles_blocks_image articles_blocks_image_image_id_media_assets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_image
    ADD CONSTRAINT articles_blocks_image_image_id_media_assets_id_fk FOREIGN KEY (image_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: articles_blocks_image articles_blocks_image_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_image
    ADD CONSTRAINT articles_blocks_image_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.articles(id) ON DELETE CASCADE;


--
-- Name: articles_blocks_img_pair articles_blocks_img_pair_image_one_id_media_assets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_img_pair
    ADD CONSTRAINT articles_blocks_img_pair_image_one_id_media_assets_id_fk FOREIGN KEY (image_one_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: articles_blocks_img_pair articles_blocks_img_pair_image_two_id_media_assets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_img_pair
    ADD CONSTRAINT articles_blocks_img_pair_image_two_id_media_assets_id_fk FOREIGN KEY (image_two_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: articles_blocks_img_pair articles_blocks_img_pair_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_img_pair
    ADD CONSTRAINT articles_blocks_img_pair_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.articles(id) ON DELETE CASCADE;


--
-- Name: articles_blocks_img_trio articles_blocks_img_trio_image_one_id_media_assets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_img_trio
    ADD CONSTRAINT articles_blocks_img_trio_image_one_id_media_assets_id_fk FOREIGN KEY (image_one_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: articles_blocks_img_trio articles_blocks_img_trio_image_three_id_media_assets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_img_trio
    ADD CONSTRAINT articles_blocks_img_trio_image_three_id_media_assets_id_fk FOREIGN KEY (image_three_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: articles_blocks_img_trio articles_blocks_img_trio_image_two_id_media_assets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_img_trio
    ADD CONSTRAINT articles_blocks_img_trio_image_two_id_media_assets_id_fk FOREIGN KEY (image_two_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: articles_blocks_img_trio articles_blocks_img_trio_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_img_trio
    ADD CONSTRAINT articles_blocks_img_trio_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.articles(id) ON DELETE CASCADE;


--
-- Name: articles_blocks_in_the_know articles_blocks_in_the_know_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_in_the_know
    ADD CONSTRAINT articles_blocks_in_the_know_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.articles(id) ON DELETE CASCADE;


--
-- Name: articles_blocks_key_takeaway_items articles_blocks_key_takeaway_items_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_key_takeaway_items
    ADD CONSTRAINT articles_blocks_key_takeaway_items_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.articles_blocks_key_takeaway(id) ON DELETE CASCADE;


--
-- Name: articles_blocks_key_takeaway articles_blocks_key_takeaway_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_key_takeaway
    ADD CONSTRAINT articles_blocks_key_takeaway_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.articles(id) ON DELETE CASCADE;


--
-- Name: articles_blocks_pull_quote articles_blocks_pull_quote_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_pull_quote
    ADD CONSTRAINT articles_blocks_pull_quote_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.articles(id) ON DELETE CASCADE;


--
-- Name: articles_blocks_text articles_blocks_text_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_blocks_text
    ADD CONSTRAINT articles_blocks_text_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.articles(id) ON DELETE CASCADE;


--
-- Name: articles articles_category_id_article_categories_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_category_id_article_categories_id_fk FOREIGN KEY (category_id) REFERENCES public.article_categories(id) ON DELETE SET NULL;


--
-- Name: articles articles_header_section_featured_image_id_media_assets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_header_section_featured_image_id_media_assets_id_fk FOREIGN KEY (header_section_featured_image_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: articles articles_header_section_featured_media_set_id_media_sets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_header_section_featured_media_set_id_media_sets_id_fk FOREIGN KEY (header_section_featured_media_set_id) REFERENCES public.media_sets(id) ON DELETE SET NULL;


--
-- Name: articles articles_location_ref_id_locations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_location_ref_id_locations_id_fk FOREIGN KEY (location_ref_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: articles_rels articles_rels_article_tags_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_rels
    ADD CONSTRAINT articles_rels_article_tags_fk FOREIGN KEY (article_tags_id) REFERENCES public.article_tags(id) ON DELETE CASCADE;


--
-- Name: articles_rels articles_rels_locations_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_rels
    ADD CONSTRAINT articles_rels_locations_fk FOREIGN KEY (locations_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: articles_rels articles_rels_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles_rels
    ADD CONSTRAINT articles_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES public.articles(id) ON DELETE CASCADE;


--
-- Name: attractions attractions_created_by_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attractions
    ADD CONSTRAINT attractions_created_by_id_users_id_fk FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: attractions_gallery attractions_gallery_image_id_media_sets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attractions_gallery
    ADD CONSTRAINT attractions_gallery_image_id_media_sets_id_fk FOREIGN KEY (image_id) REFERENCES public.media_sets(id) ON DELETE SET NULL;


--
-- Name: attractions_gallery attractions_gallery_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attractions_gallery
    ADD CONSTRAINT attractions_gallery_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.attractions(id) ON DELETE CASCADE;


--
-- Name: attractions_instagram_gallery attractions_instagram_gallery_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attractions_instagram_gallery
    ADD CONSTRAINT attractions_instagram_gallery_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.attractions(id) ON DELETE CASCADE;


--
-- Name: attractions_instagram_gallery attractions_instagram_gallery_post_id_instagram_posts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attractions_instagram_gallery
    ADD CONSTRAINT attractions_instagram_gallery_post_id_instagram_posts_id_fk FOREIGN KEY (post_id) REFERENCES public.instagram_posts(id) ON DELETE SET NULL;


--
-- Name: attractions attractions_location_ref_id_locations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attractions
    ADD CONSTRAINT attractions_location_ref_id_locations_id_fk FOREIGN KEY (location_ref_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: attractions_rels attractions_rels_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attractions_rels
    ADD CONSTRAINT attractions_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES public.attractions(id) ON DELETE CASCADE;


--
-- Name: attractions_rels attractions_rels_tours_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attractions_rels
    ADD CONSTRAINT attractions_rels_tours_fk FOREIGN KEY (tours_id) REFERENCES public.tours(id) ON DELETE CASCADE;


--
-- Name: authors_article_byline_featured_links authors_article_byline_featured_links_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authors_article_byline_featured_links
    ADD CONSTRAINT authors_article_byline_featured_links_parent_fk FOREIGN KEY (parent_id) REFERENCES public.authors(id) ON DELETE CASCADE;


--
-- Name: authors_author_images authors_author_images_media_set_id_media_sets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authors_author_images
    ADD CONSTRAINT authors_author_images_media_set_id_media_sets_id_fk FOREIGN KEY (media_set_id) REFERENCES public.media_sets(id) ON DELETE SET NULL;


--
-- Name: authors_author_images authors_author_images_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authors_author_images
    ADD CONSTRAINT authors_author_images_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.authors(id) ON DELETE CASCADE;


--
-- Name: authors authors_avatar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authors
    ADD CONSTRAINT authors_avatar_id_fkey FOREIGN KEY (avatar_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: authors_expertise authors_expertise__parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authors_expertise
    ADD CONSTRAINT authors_expertise__parent_id_fkey FOREIGN KEY (_parent_id) REFERENCES public.authors(id) ON DELETE CASCADE;


--
-- Name: authors authors_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authors
    ADD CONSTRAINT authors_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: currencies_regions currencies_regions_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies_regions
    ADD CONSTRAINT currencies_regions_parent_fk FOREIGN KEY (parent_id) REFERENCES public.currencies(id) ON DELETE CASCADE;


--
-- Name: currencies_used_in currencies_used_in_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies_used_in
    ADD CONSTRAINT currencies_used_in_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.currencies(id) ON DELETE CASCADE;


--
-- Name: dining dining_created_by_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dining
    ADD CONSTRAINT dining_created_by_id_users_id_fk FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: dining_gallery dining_gallery_image_id_media_sets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dining_gallery
    ADD CONSTRAINT dining_gallery_image_id_media_sets_id_fk FOREIGN KEY (image_id) REFERENCES public.media_sets(id) ON DELETE SET NULL;


--
-- Name: dining_gallery dining_gallery_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dining_gallery
    ADD CONSTRAINT dining_gallery_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.dining(id) ON DELETE CASCADE;


--
-- Name: dining_instagram_gallery dining_instagram_gallery_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dining_instagram_gallery
    ADD CONSTRAINT dining_instagram_gallery_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.dining(id) ON DELETE CASCADE;


--
-- Name: dining_instagram_gallery dining_instagram_gallery_post_id_instagram_posts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dining_instagram_gallery
    ADD CONSTRAINT dining_instagram_gallery_post_id_instagram_posts_id_fk FOREIGN KEY (post_id) REFERENCES public.instagram_posts(id) ON DELETE SET NULL;


--
-- Name: dining dining_location_ref_id_locations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dining
    ADD CONSTRAINT dining_location_ref_id_locations_id_fk FOREIGN KEY (location_ref_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: instagram_posts instagram_posts_preview_image_id_media_assets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_posts
    ADD CONSTRAINT instagram_posts_preview_image_id_media_assets_id_fk FOREIGN KEY (preview_image_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: ita ita_image_id_media_assets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ita
    ADD CONSTRAINT ita_image_id_media_assets_id_fk FOREIGN KEY (image_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: ita ita_instagram_post_id_instagram_posts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ita
    ADD CONSTRAINT ita_instagram_post_id_instagram_posts_id_fk FOREIGN KEY (instagram_post_id) REFERENCES public.instagram_posts(id) ON DELETE SET NULL;


--
-- Name: ita ita_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ita
    ADD CONSTRAINT ita_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.listicle_itineraries(id) ON DELETE CASCADE;


--
-- Name: key_locations key_locations_created_by_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_locations
    ADD CONSTRAINT key_locations_created_by_id_users_id_fk FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: key_locations_gallery key_locations_gallery_image_id_media_sets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_locations_gallery
    ADD CONSTRAINT key_locations_gallery_image_id_media_sets_id_fk FOREIGN KEY (image_id) REFERENCES public.media_sets(id) ON DELETE SET NULL;


--
-- Name: key_locations_gallery key_locations_gallery_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_locations_gallery
    ADD CONSTRAINT key_locations_gallery_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.key_locations(id) ON DELETE CASCADE;


--
-- Name: key_locations_instagram_gallery key_locations_instagram_gallery_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_locations_instagram_gallery
    ADD CONSTRAINT key_locations_instagram_gallery_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.key_locations(id) ON DELETE CASCADE;


--
-- Name: key_locations_instagram_gallery key_locations_instagram_gallery_post_id_instagram_posts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_locations_instagram_gallery
    ADD CONSTRAINT key_locations_instagram_gallery_post_id_instagram_posts_id_fk FOREIGN KEY (post_id) REFERENCES public.instagram_posts(id) ON DELETE SET NULL;


--
-- Name: key_locations key_locations_location_ref_id_locations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_locations
    ADD CONSTRAINT key_locations_location_ref_id_locations_id_fk FOREIGN KEY (location_ref_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: kls kls_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kls
    ADD CONSTRAINT kls_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.ita(id) ON DELETE CASCADE;


--
-- Name: listicle_itineraries listicle_itineraries_author_id_authors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries
    ADD CONSTRAINT listicle_itineraries_author_id_authors_id_fk FOREIGN KEY (author_id) REFERENCES public.authors(id) ON DELETE RESTRICT;


--
-- Name: listicle_itineraries_blocks_itinerary_accommodations listicle_itineraries_blocks_itinerary_accommodations_item_id_ac; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_accommodations
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_accommodations_item_id_ac FOREIGN KEY (item_id) REFERENCES public.accommodations(id) ON DELETE SET NULL;


--
-- Name: listicle_itineraries_blocks_itinerary_accommodations listicle_itineraries_blocks_itinerary_accommodations_parent_id_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_accommodations
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_accommodations_parent_id_ FOREIGN KEY (_parent_id) REFERENCES public.listicle_itineraries(id) ON DELETE CASCADE;


--
-- Name: listicle_itineraries_blocks_itinerary_accommodations listicle_itineraries_blocks_itinerary_accommodations_selected_i; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_accommodations
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_accommodations_selected_i FOREIGN KEY (selected_instagram_post_id) REFERENCES public.instagram_posts(id) ON DELETE SET NULL;


--
-- Name: listicle_itineraries_blocks_itinerary_attractions listicle_itineraries_blocks_itinerary_attractions_item_id_attra; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_attractions
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_attractions_item_id_attra FOREIGN KEY (item_id) REFERENCES public.attractions(id) ON DELETE SET NULL;


--
-- Name: listicle_itineraries_blocks_itinerary_attractions listicle_itineraries_blocks_itinerary_attractions_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_attractions
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_attractions_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.listicle_itineraries(id) ON DELETE CASCADE;


--
-- Name: listicle_itineraries_blocks_itinerary_attractions listicle_itineraries_blocks_itinerary_attractions_selected_inst; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_attractions
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_attractions_selected_inst FOREIGN KEY (selected_instagram_post_id) REFERENCES public.instagram_posts(id) ON DELETE SET NULL;


--
-- Name: listicle_itineraries_blocks_itinerary_dining listicle_itineraries_blocks_itinerary_dining_item_id_dining_id_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_dining
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_dining_item_id_dining_id_ FOREIGN KEY (item_id) REFERENCES public.dining(id) ON DELETE SET NULL;


--
-- Name: listicle_itineraries_blocks_itinerary_dining listicle_itineraries_blocks_itinerary_dining_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_dining
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_dining_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.listicle_itineraries(id) ON DELETE CASCADE;


--
-- Name: listicle_itineraries_blocks_itinerary_dining listicle_itineraries_blocks_itinerary_dining_selected_instagram; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_dining
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_dining_selected_instagram FOREIGN KEY (selected_instagram_post_id) REFERENCES public.instagram_posts(id) ON DELETE SET NULL;


--
-- Name: listicle_itineraries_blocks_itinerary_key_location listicle_itineraries_blocks_itinerary_key_location_item_id_key_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_key_location
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_key_location_item_id_key_ FOREIGN KEY (item_id) REFERENCES public.key_locations(id) ON DELETE SET NULL;


--
-- Name: listicle_itineraries_blocks_itinerary_key_location listicle_itineraries_blocks_itinerary_key_location_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_key_location
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_key_location_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.listicle_itineraries(id) ON DELETE CASCADE;


--
-- Name: listicle_itineraries_blocks_itinerary_key_location listicle_itineraries_blocks_itinerary_key_location_selected_ins; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_key_location
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_key_location_selected_ins FOREIGN KEY (selected_instagram_post_id) REFERENCES public.instagram_posts(id) ON DELETE SET NULL;


--
-- Name: listicle_itineraries_blocks_itinerary_nightlife listicle_itineraries_blocks_itinerary_nightlife_item_id_nightli; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_nightlife
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_nightlife_item_id_nightli FOREIGN KEY (item_id) REFERENCES public.nightlife(id) ON DELETE SET NULL;


--
-- Name: listicle_itineraries_blocks_itinerary_nightlife listicle_itineraries_blocks_itinerary_nightlife_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_nightlife
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_nightlife_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.listicle_itineraries(id) ON DELETE CASCADE;


--
-- Name: listicle_itineraries_blocks_itinerary_nightlife listicle_itineraries_blocks_itinerary_nightlife_selected_instag; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_nightlife
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_nightlife_selected_instag FOREIGN KEY (selected_instagram_post_id) REFERENCES public.instagram_posts(id) ON DELETE SET NULL;


--
-- Name: listicle_itineraries_blocks_itinerary_where_staying listicle_itineraries_blocks_itinerary_where_staying_item_id_acc; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_where_staying
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_where_staying_item_id_acc FOREIGN KEY (item_id) REFERENCES public.accommodations(id) ON DELETE SET NULL;


--
-- Name: listicle_itineraries_blocks_itinerary_where_staying listicle_itineraries_blocks_itinerary_where_staying_parent_id_f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_where_staying
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_where_staying_parent_id_f FOREIGN KEY (_parent_id) REFERENCES public.listicle_itineraries(id) ON DELETE CASCADE;


--
-- Name: listicle_itineraries_blocks_itinerary_where_staying listicle_itineraries_blocks_itinerary_where_staying_selected_in; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_blocks_itinerary_where_staying
    ADD CONSTRAINT listicle_itineraries_blocks_itinerary_where_staying_selected_in FOREIGN KEY (selected_instagram_post_id) REFERENCES public.instagram_posts(id) ON DELETE SET NULL;


--
-- Name: listicle_itineraries listicle_itineraries_header_featured_image_id_media_assets_id_f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries
    ADD CONSTRAINT listicle_itineraries_header_featured_image_id_media_assets_id_f FOREIGN KEY (header_featured_image_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: listicle_itineraries listicle_itineraries_header_featured_media_set_id_media_sets_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries
    ADD CONSTRAINT listicle_itineraries_header_featured_media_set_id_media_sets_id FOREIGN KEY (header_featured_media_set_id) REFERENCES public.media_sets(id) ON DELETE SET NULL;


--
-- Name: listicle_itineraries_itinerary_days listicle_itineraries_itinerary_days_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_itinerary_days
    ADD CONSTRAINT listicle_itineraries_itinerary_days_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.listicle_itineraries(id) ON DELETE CASCADE;


--
-- Name: listicle_itineraries listicle_itineraries_location_ref_id_locations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries
    ADD CONSTRAINT listicle_itineraries_location_ref_id_locations_id_fk FOREIGN KEY (location_ref_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: listicle_itineraries_rels listicle_itineraries_rels_accommodations_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_rels
    ADD CONSTRAINT listicle_itineraries_rels_accommodations_fk FOREIGN KEY (accommodations_id) REFERENCES public.accommodations(id) ON DELETE CASCADE;


--
-- Name: listicle_itineraries_rels listicle_itineraries_rels_attractions_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_rels
    ADD CONSTRAINT listicle_itineraries_rels_attractions_fk FOREIGN KEY (attractions_id) REFERENCES public.attractions(id) ON DELETE CASCADE;


--
-- Name: listicle_itineraries_rels listicle_itineraries_rels_dining_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_rels
    ADD CONSTRAINT listicle_itineraries_rels_dining_fk FOREIGN KEY (dining_id) REFERENCES public.dining(id) ON DELETE CASCADE;


--
-- Name: listicle_itineraries_rels listicle_itineraries_rels_key_locations_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_rels
    ADD CONSTRAINT listicle_itineraries_rels_key_locations_fk FOREIGN KEY (key_locations_id) REFERENCES public.key_locations(id) ON DELETE CASCADE;


--
-- Name: listicle_itineraries_rels listicle_itineraries_rels_locations_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_rels
    ADD CONSTRAINT listicle_itineraries_rels_locations_fk FOREIGN KEY (locations_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: listicle_itineraries_rels listicle_itineraries_rels_media_sets_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_rels
    ADD CONSTRAINT listicle_itineraries_rels_media_sets_fk FOREIGN KEY (media_sets_id) REFERENCES public.media_sets(id) ON DELETE CASCADE;


--
-- Name: listicle_itineraries_rels listicle_itineraries_rels_nightlife_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_rels
    ADD CONSTRAINT listicle_itineraries_rels_nightlife_fk FOREIGN KEY (nightlife_id) REFERENCES public.nightlife(id) ON DELETE CASCADE;


--
-- Name: listicle_itineraries_rels listicle_itineraries_rels_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_rels
    ADD CONSTRAINT listicle_itineraries_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES public.listicle_itineraries(id) ON DELETE CASCADE;


--
-- Name: listicle_itineraries_rels listicle_itineraries_rels_tours_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listicle_itineraries_rels
    ADD CONSTRAINT listicle_itineraries_rels_tours_fk FOREIGN KEY (tours_id) REFERENCES public.tours(id) ON DELETE CASCADE;


--
-- Name: location_homepages_blocks_article_grid location_homepages_blocks_article_grid_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_article_grid
    ADD CONSTRAINT location_homepages_blocks_article_grid_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.location_homepages(id) ON DELETE CASCADE;


--
-- Name: location_homepages_blocks_article_list location_homepages_blocks_article_list_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_article_list
    ADD CONSTRAINT location_homepages_blocks_article_list_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.location_homepages(id) ON DELETE CASCADE;


--
-- Name: location_homepages_blocks_author_feature_author_cards location_homepages_blocks_author_feature_author_cards_author_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_author_feature_author_cards
    ADD CONSTRAINT location_homepages_blocks_author_feature_author_cards_author_id FOREIGN KEY (author_id) REFERENCES public.authors(id) ON DELETE SET NULL;


--
-- Name: location_homepages_blocks_author_feature_author_cards location_homepages_blocks_author_feature_author_cards_image_id_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_author_feature_author_cards
    ADD CONSTRAINT location_homepages_blocks_author_feature_author_cards_image_id_ FOREIGN KEY (image_id) REFERENCES public.media_sets(id) ON DELETE SET NULL;


--
-- Name: location_homepages_blocks_author_feature_author_cards location_homepages_blocks_author_feature_author_cards_parent_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_author_feature_author_cards
    ADD CONSTRAINT location_homepages_blocks_author_feature_author_cards_parent_id FOREIGN KEY (_parent_id) REFERENCES public.location_homepages_blocks_author_feature(id) ON DELETE CASCADE;


--
-- Name: location_homepages_blocks_author_feature location_homepages_blocks_author_feature_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_author_feature
    ADD CONSTRAINT location_homepages_blocks_author_feature_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.location_homepages(id) ON DELETE CASCADE;


--
-- Name: location_homepages_blocks_author_feature_selected_expertise location_homepages_blocks_author_feature_selected_expertise_par; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_author_feature_selected_expertise
    ADD CONSTRAINT location_homepages_blocks_author_feature_selected_expertise_par FOREIGN KEY (_parent_id) REFERENCES public.location_homepages_blocks_author_feature(id) ON DELETE CASCADE;


--
-- Name: location_homepages_blocks_editorial_feature location_homepages_blocks_editorial_feature_feature_media_set_i; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_editorial_feature
    ADD CONSTRAINT location_homepages_blocks_editorial_feature_feature_media_set_i FOREIGN KEY (feature_media_set_id) REFERENCES public.media_sets(id) ON DELETE SET NULL;


--
-- Name: location_homepages_blocks_editorial_feature location_homepages_blocks_editorial_feature_linked_location_id_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_editorial_feature
    ADD CONSTRAINT location_homepages_blocks_editorial_feature_linked_location_id_ FOREIGN KEY (linked_location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: location_homepages_blocks_editorial_feature location_homepages_blocks_editorial_feature_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_editorial_feature
    ADD CONSTRAINT location_homepages_blocks_editorial_feature_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.location_homepages(id) ON DELETE CASCADE;


--
-- Name: location_homepages_blocks_featured_article_carousel location_homepages_blocks_featured_article_carousel_parent_id_f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_featured_article_carousel
    ADD CONSTRAINT location_homepages_blocks_featured_article_carousel_parent_id_f FOREIGN KEY (_parent_id) REFERENCES public.location_homepages(id) ON DELETE CASCADE;


--
-- Name: location_homepages_blocks_featured_article location_homepages_blocks_featured_article_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_featured_article
    ADD CONSTRAINT location_homepages_blocks_featured_article_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.location_homepages(id) ON DELETE CASCADE;


--
-- Name: location_homepages_blocks_featured_articles location_homepages_blocks_featured_articles_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_featured_articles
    ADD CONSTRAINT location_homepages_blocks_featured_articles_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.location_homepages(id) ON DELETE CASCADE;


--
-- Name: location_homepages_blocks_featured_creator_article location_homepages_blocks_featured_creator_article_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_featured_creator_article
    ADD CONSTRAINT location_homepages_blocks_featured_creator_article_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.location_homepages(id) ON DELETE CASCADE;


--
-- Name: location_homepages_blocks_hotel_grid location_homepages_blocks_hotel_grid_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_hotel_grid
    ADD CONSTRAINT location_homepages_blocks_hotel_grid_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.location_homepages(id) ON DELETE CASCADE;


--
-- Name: location_homepages_blocks_location_grid location_homepages_blocks_location_grid_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_location_grid
    ADD CONSTRAINT location_homepages_blocks_location_grid_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.location_homepages(id) ON DELETE CASCADE;


--
-- Name: location_homepages_blocks_newsletter_signup location_homepages_blocks_newsletter_signup_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_newsletter_signup
    ADD CONSTRAINT location_homepages_blocks_newsletter_signup_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.location_homepages(id) ON DELETE CASCADE;


--
-- Name: location_homepages_blocks_questurian_maps location_homepages_blocks_questurian_maps_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_questurian_maps
    ADD CONSTRAINT location_homepages_blocks_questurian_maps_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.location_homepages(id) ON DELETE CASCADE;


--
-- Name: location_homepages_blocks_things_to_do_attractions location_homepages_blocks_things_to_do_attractions_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_things_to_do_attractions
    ADD CONSTRAINT location_homepages_blocks_things_to_do_attractions_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.location_homepages(id) ON DELETE CASCADE;


--
-- Name: location_homepages_blocks_things_to_do_listicles location_homepages_blocks_things_to_do_listicles_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_things_to_do_listicles
    ADD CONSTRAINT location_homepages_blocks_things_to_do_listicles_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.location_homepages(id) ON DELETE CASCADE;


--
-- Name: location_homepages_blocks_tour_grid location_homepages_blocks_tour_grid_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_tour_grid
    ADD CONSTRAINT location_homepages_blocks_tour_grid_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.location_homepages(id) ON DELETE CASCADE;


--
-- Name: location_homepages_blocks_where_to_eat_drink location_homepages_blocks_where_to_eat_drink_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_blocks_where_to_eat_drink
    ADD CONSTRAINT location_homepages_blocks_where_to_eat_drink_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.location_homepages(id) ON DELETE CASCADE;


--
-- Name: location_homepages location_homepages_last_published_by_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages
    ADD CONSTRAINT location_homepages_last_published_by_id_users_id_fk FOREIGN KEY (last_published_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: location_homepages location_homepages_location_id_locations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages
    ADD CONSTRAINT location_homepages_location_id_locations_id_fk FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: location_homepages_rels location_homepages_rels_accommodations_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_rels
    ADD CONSTRAINT location_homepages_rels_accommodations_fk FOREIGN KEY (accommodations_id) REFERENCES public.accommodations(id) ON DELETE CASCADE;


--
-- Name: location_homepages_rels location_homepages_rels_articles_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_rels
    ADD CONSTRAINT location_homepages_rels_articles_fk FOREIGN KEY (articles_id) REFERENCES public.articles(id) ON DELETE CASCADE;


--
-- Name: location_homepages_rels location_homepages_rels_attractions_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_rels
    ADD CONSTRAINT location_homepages_rels_attractions_fk FOREIGN KEY (attractions_id) REFERENCES public.attractions(id) ON DELETE CASCADE;


--
-- Name: location_homepages_rels location_homepages_rels_listicle_itineraries_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_rels
    ADD CONSTRAINT location_homepages_rels_listicle_itineraries_fk FOREIGN KEY (listicle_itineraries_id) REFERENCES public.listicle_itineraries(id) ON DELETE CASCADE;


--
-- Name: location_homepages_rels location_homepages_rels_locations_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_rels
    ADD CONSTRAINT location_homepages_rels_locations_fk FOREIGN KEY (locations_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: location_homepages_rels location_homepages_rels_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_rels
    ADD CONSTRAINT location_homepages_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES public.location_homepages(id) ON DELETE CASCADE;


--
-- Name: location_homepages_rels location_homepages_rels_single_type_listicles_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_rels
    ADD CONSTRAINT location_homepages_rels_single_type_listicles_fk FOREIGN KEY (single_type_listicles_id) REFERENCES public.single_type_listicles(id) ON DELETE CASCADE;


--
-- Name: location_homepages_rels location_homepages_rels_tours_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_homepages_rels
    ADD CONSTRAINT location_homepages_rels_tours_fk FOREIGN KEY (tours_id) REFERENCES public.tours(id) ON DELETE CASCADE;


--
-- Name: locations locations_cover_image_id_media_sets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_cover_image_id_media_sets_id_fk FOREIGN KEY (cover_image_id) REFERENCES public.media_sets(id) ON DELETE SET NULL;


--
-- Name: main_homepage main_homepage_last_published_by_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.main_homepage
    ADD CONSTRAINT main_homepage_last_published_by_id_users_id_fk FOREIGN KEY (last_published_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: media_assets media_assets_location_ref_id_locations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_location_ref_id_locations_id_fk FOREIGN KEY (location_ref_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: media_assets media_assets_media_set_id_media_sets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_media_set_id_media_sets_id_fk FOREIGN KEY (media_set_id) REFERENCES public.media_sets(id) ON DELETE SET NULL;


--
-- Name: media_assets_rels media_assets_rels_article_tags_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets_rels
    ADD CONSTRAINT media_assets_rels_article_tags_fk FOREIGN KEY (article_tags_id) REFERENCES public.article_tags(id) ON DELETE CASCADE;


--
-- Name: media_assets_rels media_assets_rels_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets_rels
    ADD CONSTRAINT media_assets_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES public.media_assets(id) ON DELETE CASCADE;


--
-- Name: media_assets media_assets_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: media_sets media_sets_created_by_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_sets
    ADD CONSTRAINT media_sets_created_by_id_users_id_fk FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: media_sets media_sets_location_ref_id_locations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_sets
    ADD CONSTRAINT media_sets_location_ref_id_locations_id_fk FOREIGN KEY (location_ref_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: media_sets_rels media_sets_rels_article_tags_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_sets_rels
    ADD CONSTRAINT media_sets_rels_article_tags_fk FOREIGN KEY (article_tags_id) REFERENCES public.article_tags(id) ON DELETE CASCADE;


--
-- Name: media_sets_rels media_sets_rels_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_sets_rels
    ADD CONSTRAINT media_sets_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES public.media_sets(id) ON DELETE CASCADE;


--
-- Name: media_sets media_sets_source_id_media_assets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_sets
    ADD CONSTRAINT media_sets_source_id_media_assets_id_fk FOREIGN KEY (source_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: media_sets media_sets_variants_editorial_id_media_assets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_sets
    ADD CONSTRAINT media_sets_variants_editorial_id_media_assets_id_fk FOREIGN KEY (variants_editorial_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: media_sets media_sets_variants_hero_id_media_assets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_sets
    ADD CONSTRAINT media_sets_variants_hero_id_media_assets_id_fk FOREIGN KEY (variants_hero_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: media_sets media_sets_variants_open_graph_id_media_assets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_sets
    ADD CONSTRAINT media_sets_variants_open_graph_id_media_assets_id_fk FOREIGN KEY (variants_open_graph_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: media_sets media_sets_variants_portrait_id_media_assets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_sets
    ADD CONSTRAINT media_sets_variants_portrait_id_media_assets_id_fk FOREIGN KEY (variants_portrait_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: media_sets media_sets_variants_square_id_media_assets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_sets
    ADD CONSTRAINT media_sets_variants_square_id_media_assets_id_fk FOREIGN KEY (variants_square_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: media_sets media_sets_variants_thumbnail_id_media_assets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_sets
    ADD CONSTRAINT media_sets_variants_thumbnail_id_media_assets_id_fk FOREIGN KEY (variants_thumbnail_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: media_sets media_sets_variants_wide_id_media_assets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_sets
    ADD CONSTRAINT media_sets_variants_wide_id_media_assets_id_fk FOREIGN KEY (variants_wide_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: nightlife nightlife_created_by_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nightlife
    ADD CONSTRAINT nightlife_created_by_id_users_id_fk FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: nightlife_gallery nightlife_gallery_image_id_media_sets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nightlife_gallery
    ADD CONSTRAINT nightlife_gallery_image_id_media_sets_id_fk FOREIGN KEY (image_id) REFERENCES public.media_sets(id) ON DELETE SET NULL;


--
-- Name: nightlife_gallery nightlife_gallery_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nightlife_gallery
    ADD CONSTRAINT nightlife_gallery_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.nightlife(id) ON DELETE CASCADE;


--
-- Name: nightlife_instagram_gallery nightlife_instagram_gallery_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nightlife_instagram_gallery
    ADD CONSTRAINT nightlife_instagram_gallery_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.nightlife(id) ON DELETE CASCADE;


--
-- Name: nightlife_instagram_gallery nightlife_instagram_gallery_post_id_instagram_posts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nightlife_instagram_gallery
    ADD CONSTRAINT nightlife_instagram_gallery_post_id_instagram_posts_id_fk FOREIGN KEY (post_id) REFERENCES public.instagram_posts(id) ON DELETE SET NULL;


--
-- Name: nightlife nightlife_location_ref_id_locations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nightlife
    ADD CONSTRAINT nightlife_location_ref_id_locations_id_fk FOREIGN KEY (location_ref_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: nightlife_texts nightlife_texts_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nightlife_texts
    ADD CONSTRAINT nightlife_texts_parent_fk FOREIGN KEY (parent_id) REFERENCES public.nightlife(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_accommodations_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_accommodations_fk FOREIGN KEY (accommodations_id) REFERENCES public.accommodations(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_affiliate_products_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_affiliate_products_fk FOREIGN KEY (affiliate_products_id) REFERENCES public.affiliate_products(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_article_categories_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_article_categories_fk FOREIGN KEY (article_categories_id) REFERENCES public.article_categories(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_article_redirects_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_article_redirects_fk FOREIGN KEY (article_redirects_id) REFERENCES public.article_redirects(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_article_tags_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_article_tags_fk FOREIGN KEY (article_tags_id) REFERENCES public.article_tags(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_articles_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_articles_fk FOREIGN KEY (articles_id) REFERENCES public.articles(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_attractions_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_attractions_fk FOREIGN KEY (attractions_id) REFERENCES public.attractions(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_authors_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_authors_fk FOREIGN KEY (authors_id) REFERENCES public.authors(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_bookmarks_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_bookmarks_fk FOREIGN KEY (bookmarks_id) REFERENCES public.bookmarks(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_currencies_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_currencies_fk FOREIGN KEY (currencies_id) REFERENCES public.currencies(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_dining_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_dining_fk FOREIGN KEY (dining_id) REFERENCES public.dining(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_instagram_posts_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_instagram_posts_fk FOREIGN KEY (instagram_posts_id) REFERENCES public.instagram_posts(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_key_locations_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_key_locations_fk FOREIGN KEY (key_locations_id) REFERENCES public.key_locations(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_listicle_itineraries_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_listicle_itineraries_fk FOREIGN KEY (listicle_itineraries_id) REFERENCES public.listicle_itineraries(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_location_homepages_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_location_homepages_fk FOREIGN KEY (location_homepages_id) REFERENCES public.location_homepages(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_locations_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_locations_fk FOREIGN KEY (locations_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_media_assets_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_media_assets_fk FOREIGN KEY (media_assets_id) REFERENCES public.media_assets(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_media_sets_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_media_sets_fk FOREIGN KEY (media_sets_id) REFERENCES public.media_sets(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_nightlife_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_nightlife_fk FOREIGN KEY (nightlife_id) REFERENCES public.nightlife(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES public.payload_locked_documents(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_perfect_for_tags_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_perfect_for_tags_fk FOREIGN KEY (perfect_for_tags_id) REFERENCES public.perfect_for_tags(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_refresh_jobs_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_refresh_jobs_fk FOREIGN KEY (refresh_jobs_id) REFERENCES public.refresh_jobs(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_service_accounts_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_service_accounts_fk FOREIGN KEY (service_accounts_id) REFERENCES public.service_accounts(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_single_type_listicles_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_single_type_listicles_fk FOREIGN KEY (single_type_listicles_id) REFERENCES public.single_type_listicles(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_stripe_webhook_events_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_stripe_webhook_events_fk FOREIGN KEY (stripe_webhook_events_id) REFERENCES public.stripe_webhook_events(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_tours_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_tours_fk FOREIGN KEY (tours_id) REFERENCES public.tours(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_users_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_users_fk FOREIGN KEY (users_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_visitor_profiles_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_visitor_profiles_fk FOREIGN KEY (visitor_profiles_id) REFERENCES public.visitor_profiles(id) ON DELETE CASCADE;


--
-- Name: payload_preferences_rels payload_preferences_rels_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_preferences_rels
    ADD CONSTRAINT payload_preferences_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES public.payload_preferences(id) ON DELETE CASCADE;


--
-- Name: payload_preferences_rels payload_preferences_rels_service_accounts_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_preferences_rels
    ADD CONSTRAINT payload_preferences_rels_service_accounts_fk FOREIGN KEY (service_accounts_id) REFERENCES public.service_accounts(id) ON DELETE CASCADE;


--
-- Name: payload_preferences_rels payload_preferences_rels_users_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_preferences_rels
    ADD CONSTRAINT payload_preferences_rels_users_fk FOREIGN KEY (users_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: perfect_for_tags_applicable_types perfect_for_tags_applicable_types_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfect_for_tags_applicable_types
    ADD CONSTRAINT perfect_for_tags_applicable_types_parent_fk FOREIGN KEY (parent_id) REFERENCES public.perfect_for_tags(id) ON DELETE CASCADE;


--
-- Name: perfect_for_tags perfect_for_tags_created_by_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfect_for_tags
    ADD CONSTRAINT perfect_for_tags_created_by_id_users_id_fk FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: single_type_listicles single_type_listicles_author_id_authors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles
    ADD CONSTRAINT single_type_listicles_author_id_authors_id_fk FOREIGN KEY (author_id) REFERENCES public.authors(id) ON DELETE RESTRICT;


--
-- Name: single_type_listicles_blocks_data_accommodations single_type_listicles_blocks_data_accommodations_item_id_accomm; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles_blocks_data_accommodations
    ADD CONSTRAINT single_type_listicles_blocks_data_accommodations_item_id_accomm FOREIGN KEY (item_id) REFERENCES public.accommodations(id) ON DELETE SET NULL;


--
-- Name: single_type_listicles_blocks_data_accommodations single_type_listicles_blocks_data_accommodations_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles_blocks_data_accommodations
    ADD CONSTRAINT single_type_listicles_blocks_data_accommodations_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.single_type_listicles(id) ON DELETE CASCADE;


--
-- Name: single_type_listicles_blocks_data_accommodations single_type_listicles_blocks_data_accommodations_selected_insta; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles_blocks_data_accommodations
    ADD CONSTRAINT single_type_listicles_blocks_data_accommodations_selected_insta FOREIGN KEY (selected_instagram_post_id) REFERENCES public.instagram_posts(id) ON DELETE SET NULL;


--
-- Name: single_type_listicles_blocks_data_attractions single_type_listicles_blocks_data_attractions_item_id_attractio; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles_blocks_data_attractions
    ADD CONSTRAINT single_type_listicles_blocks_data_attractions_item_id_attractio FOREIGN KEY (item_id) REFERENCES public.attractions(id) ON DELETE SET NULL;


--
-- Name: single_type_listicles_blocks_data_attractions single_type_listicles_blocks_data_attractions_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles_blocks_data_attractions
    ADD CONSTRAINT single_type_listicles_blocks_data_attractions_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.single_type_listicles(id) ON DELETE CASCADE;


--
-- Name: single_type_listicles_blocks_data_attractions single_type_listicles_blocks_data_attractions_selected_instagra; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles_blocks_data_attractions
    ADD CONSTRAINT single_type_listicles_blocks_data_attractions_selected_instagra FOREIGN KEY (selected_instagram_post_id) REFERENCES public.instagram_posts(id) ON DELETE SET NULL;


--
-- Name: single_type_listicles_blocks_data_dining single_type_listicles_blocks_data_dining_item_id_dining_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles_blocks_data_dining
    ADD CONSTRAINT single_type_listicles_blocks_data_dining_item_id_dining_id_fk FOREIGN KEY (item_id) REFERENCES public.dining(id) ON DELETE SET NULL;


--
-- Name: single_type_listicles_blocks_data_dining single_type_listicles_blocks_data_dining_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles_blocks_data_dining
    ADD CONSTRAINT single_type_listicles_blocks_data_dining_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.single_type_listicles(id) ON DELETE CASCADE;


--
-- Name: single_type_listicles_blocks_data_dining single_type_listicles_blocks_data_dining_selected_instagram_pos; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles_blocks_data_dining
    ADD CONSTRAINT single_type_listicles_blocks_data_dining_selected_instagram_pos FOREIGN KEY (selected_instagram_post_id) REFERENCES public.instagram_posts(id) ON DELETE SET NULL;


--
-- Name: single_type_listicles_blocks_data_nightlife single_type_listicles_blocks_data_nightlife_item_id_nightlife_i; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles_blocks_data_nightlife
    ADD CONSTRAINT single_type_listicles_blocks_data_nightlife_item_id_nightlife_i FOREIGN KEY (item_id) REFERENCES public.nightlife(id) ON DELETE SET NULL;


--
-- Name: single_type_listicles_blocks_data_nightlife single_type_listicles_blocks_data_nightlife_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles_blocks_data_nightlife
    ADD CONSTRAINT single_type_listicles_blocks_data_nightlife_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.single_type_listicles(id) ON DELETE CASCADE;


--
-- Name: single_type_listicles_blocks_data_nightlife single_type_listicles_blocks_data_nightlife_selected_instagram_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles_blocks_data_nightlife
    ADD CONSTRAINT single_type_listicles_blocks_data_nightlife_selected_instagram_ FOREIGN KEY (selected_instagram_post_id) REFERENCES public.instagram_posts(id) ON DELETE SET NULL;


--
-- Name: single_type_listicles single_type_listicles_header_featured_image_id_media_assets_id_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles
    ADD CONSTRAINT single_type_listicles_header_featured_image_id_media_assets_id_ FOREIGN KEY (header_featured_image_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: single_type_listicles single_type_listicles_header_featured_media_set_id_media_sets_i; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles
    ADD CONSTRAINT single_type_listicles_header_featured_media_set_id_media_sets_i FOREIGN KEY (header_featured_media_set_id) REFERENCES public.media_sets(id) ON DELETE SET NULL;


--
-- Name: single_type_listicles single_type_listicles_location_ref_id_locations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles
    ADD CONSTRAINT single_type_listicles_location_ref_id_locations_id_fk FOREIGN KEY (location_ref_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: single_type_listicles_rels single_type_listicles_rels_locations_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles_rels
    ADD CONSTRAINT single_type_listicles_rels_locations_fk FOREIGN KEY (locations_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: single_type_listicles_rels single_type_listicles_rels_media_sets_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles_rels
    ADD CONSTRAINT single_type_listicles_rels_media_sets_fk FOREIGN KEY (media_sets_id) REFERENCES public.media_sets(id) ON DELETE CASCADE;


--
-- Name: single_type_listicles_rels single_type_listicles_rels_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles_rels
    ADD CONSTRAINT single_type_listicles_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES public.single_type_listicles(id) ON DELETE CASCADE;


--
-- Name: single_type_listicles_rels single_type_listicles_rels_tours_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.single_type_listicles_rels
    ADD CONSTRAINT single_type_listicles_rels_tours_fk FOREIGN KEY (tours_id) REFERENCES public.tours(id) ON DELETE CASCADE;


--
-- Name: tours tours_created_by_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tours
    ADD CONSTRAINT tours_created_by_id_users_id_fk FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tours tours_img_id_media_sets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tours
    ADD CONSTRAINT tours_img_id_media_sets_id_fk FOREIGN KEY (img_id) REFERENCES public.media_sets(id) ON DELETE SET NULL;


--
-- Name: tours tours_location_ref_id_locations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tours
    ADD CONSTRAINT tours_location_ref_id_locations_id_fk FOREIGN KEY (location_ref_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: users_sessions users_sessions_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users_sessions
    ADD CONSTRAINT users_sessions_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: visitor_auth_accounts visitor_auth_accounts_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_auth_accounts
    ADD CONSTRAINT "visitor_auth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.visitor_auth_users(id) ON DELETE CASCADE;


--
-- Name: visitor_auth_sessions visitor_auth_sessions_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_auth_sessions
    ADD CONSTRAINT "visitor_auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.visitor_auth_users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


-- The migration ledger, so 'payload migrate' applies only what is newer than this fixture.
INSERT INTO public.payload_migrations VALUES (13, '20260514000000_promote_location_cover_image', 1, '2026-05-30 15:33:34.633-04', '2026-05-30 15:33:34.633-04');
INSERT INTO public.payload_migrations VALUES (14, '20260514001000_drop_location_guide_storage', 1, '2026-05-30 15:33:34.633-04', '2026-05-30 15:33:34.633-04');
INSERT INTO public.payload_migrations VALUES (15, '20260515000000_media_set_source_focal_point', 1, '2026-05-30 15:33:34.633-04', '2026-05-30 15:33:34.633-04');
INSERT INTO public.payload_migrations VALUES (16, '20260528000000_itinerary_angle_and_list_tone', 1, '2026-05-30 15:33:34.633-04', '2026-05-30 15:33:34.633-04');
INSERT INTO public.payload_migrations VALUES (17, '20260529000000_better_auth_visitor_tables', 1, '2026-05-30 15:33:34.633-04', '2026-05-30 15:33:34.633-04');
INSERT INTO public.payload_migrations VALUES (18, '20260531_003454_curated_homepage_draft_published_snapshots', 2, '2026-05-30 20:41:32.742-04', '2026-05-30 20:41:32.741-04');
INSERT INTO public.payload_migrations VALUES (19, '20260531_005708_main_homepage_global', 3, '2026-05-30 20:59:28.023-04', '2026-05-30 20:59:28.022-04');
INSERT INTO public.payload_migrations VALUES (20, '20260531_220632_add_source_block_key', 4, '2026-05-31 18:11:10.013-04', '2026-05-31 18:11:10.012-04');
INSERT INTO public.payload_migrations VALUES (21, '20260601_103652_visitor_profiles_payload_schema', 5, '2026-06-11 23:13:19.97-04', '2026-06-11 23:13:19.969-04');
INSERT INTO public.payload_migrations VALUES (22, '20260612_023018_add_tour_picks_to_listicle_blocks', 5, '2026-06-11 23:13:20.015-04', '2026-06-11 23:13:20.015-04');
INSERT INTO public.payload_migrations VALUES (23, '20260703_132643_add_itinerary_tour_agency_block_storage', 6, '2026-07-04 22:43:25.137-04', '2026-07-04 22:43:25.136-04');
INSERT INTO public.payload_migrations VALUES (24, '20260704_000000_add_article_source_fields', 6, '2026-07-04 22:43:25.218-04', '2026-07-04 22:43:25.218-04');
INSERT INTO public.payload_migrations VALUES (25, '20260708_060450_reference_grid_registry_cleanup', 7, '2026-07-08 02:06:31.302-04', '2026-07-08 02:06:31.301-04');
INSERT INTO public.payload_migrations VALUES (26, '20260711_000000_add_users_author_slug', 8, '2026-07-11 15:39:37.689-04', '2026-07-11 15:39:37.689-04');
INSERT INTO public.payload_migrations VALUES (27, '20260717_000000_retire_users_public_profile_is_public', 9, '2026-07-17 18:37:25.84-04', '2026-07-17 18:37:25.839-04');
INSERT INTO public.payload_migrations VALUES (28, '20260717_010000_add_users_social_link_platforms', 9, '2026-07-17 18:37:25.85-04', '2026-07-17 18:37:25.85-04');
INSERT INTO public.payload_migrations VALUES (29, '20260717_020000_add_email_logs', 10, '2026-07-17 21:28:03.936-04', '2026-07-17 21:28:03.935-04');
INSERT INTO public.payload_migrations VALUES (30, '20260723_060311_add_itinerary_stop_moments', 11, '2026-07-23 02:46:43.678-04', '2026-07-23 02:46:43.678-04');
INSERT INTO public.payload_migrations VALUES (31, '20260723_180417_add_itinerary_moment_options', 12, '2026-07-23 14:07:51.559-04', '2026-07-23 14:07:51.558-04');
INSERT INTO public.payload_migrations VALUES (32, '20260724_171322_add_stripe_webhook_events', 13, '2026-07-28 18:12:06.5-04', '2026-07-28 18:12:06.5-04');
INSERT INTO public.payload_migrations VALUES (33, '20260811_000000_add_users_status', 14, '2026-08-11 16:46:56.268-04', '2026-08-11 16:46:56.267-04');
INSERT INTO public.payload_migrations VALUES (35, '20260811_010000_add_authors', 15, '2026-08-11 17:01:26.464-04', '2026-08-11 17:01:26.464-04');
INSERT INTO public.payload_migrations VALUES (36, '20260811_020000_repoint_bylines_to_authors', 16, '2026-08-11 17:07:09.739-04', '2026-08-11 17:07:09.739-04');
INSERT INTO public.payload_migrations VALUES (37, '20260811_030000_retire_users_public_profile', 17, '2026-08-11 17:25:00.146-04', '2026-08-11 17:25:00.145-04');
INSERT INTO public.payload_migrations VALUES (38, '20260811_040000_add_service_accounts', 18, '2026-08-11 17:28:50.198-04', '2026-08-11 17:28:50.197-04');
INSERT INTO public.payload_migrations VALUES (39, '20260812_080000_enforce_identity_email_ownership', 19, '2026-08-12 08:15:53.484-04', '2026-08-12 08:15:53.483-04');
INSERT INTO public.payload_migrations VALUES (40, '20260813_000000_add_service_accounts_preferences_rel', 20, '2026-08-20 10:01:26.568-04', '2026-08-20 10:01:26.568-04');
INSERT INTO public.payload_migrations VALUES (41, '20260813_010000_add_visitor_profile_billing_email', 20, '2026-08-20 10:01:26.582-04', '2026-08-20 10:01:26.582-04');
INSERT INTO public.payload_migrations VALUES (42, '20260814_010000_add_visitor_profile_paid_through', 20, '2026-08-20 10:01:26.586-04', '2026-08-20 10:01:26.586-04');
INSERT INTO public.payload_migrations VALUES (43, '20260814_020000_drop_legacy_membership_columns', 20, '2026-08-20 10:01:26.589-04', '2026-08-20 10:01:26.589-04');
INSERT INTO public.payload_migrations VALUES (44, '20260814_030000_unique_visitor_profile_stripe_customer_id', 20, '2026-08-20 10:01:26.594-04', '2026-08-20 10:01:26.594-04');
INSERT INTO public.payload_migrations VALUES (45, '20260815_010000_add_access_tier', 20, '2026-08-20 10:01:26.603-04', '2026-08-20 10:01:26.603-04');
INSERT INTO public.payload_migrations VALUES (46, '20260816_010000_price_tier_graphql_safe_values', 20, '2026-08-20 10:01:26.61-04', '2026-08-20 10:01:26.61-04');
INSERT INTO public.payload_migrations VALUES (47, '20260820_010000_add_bookmarks', 21, '2026-08-20 15:46:45.356-04', '2026-08-20 15:46:45.355-04');
INSERT INTO public.payload_migrations VALUES (48, '20260821_010000_add_featured_creator_article_block', 22, '2026-08-21 09:48:27.871-04', '2026-08-21 09:48:27.871-04');
INSERT INTO public.payload_migrations VALUES (49, '20260821_161023_add_author_article_byline', 23, '2026-08-21 12:12:45.372-04', '2026-08-21 12:12:45.372-04');
INSERT INTO public.payload_migrations VALUES (50, '20260822_041423_add_creator_kicker', 24, '2026-08-22 00:15:11.259-04', '2026-08-22 00:15:11.259-04');
INSERT INTO public.payload_migrations VALUES (51, '20260822_143211_add_editorial_feature_homepage_block', 25, '2026-08-22 10:32:54.729-04', '2026-08-22 10:32:54.728-04');
INSERT INTO public.payload_migrations VALUES (52, '20260822_204353_location_grid_card_descriptions', 26, '2026-08-22 16:44:28.788-04', '2026-08-22 16:44:28.787-04');
INSERT INTO public.payload_migrations VALUES (53, '20260822_224713_location_grid_card_kickers', 27, '2026-08-22 18:47:43.744-04', '2026-08-22 18:47:43.743-04');
INSERT INTO public.payload_migrations VALUES (54, '20260823_143937_add_author_feature_images_and_block', 28, '2026-08-23 10:40:02.231-04', '2026-08-23 10:40:02.23-04');
INSERT INTO public.payload_migrations VALUES (56, '20260823_212107_single_author_feature', 29, '2026-08-23 17:51:58.145-04', '2026-08-23 17:51:58.145-04');
INSERT INTO public.payload_migrations VALUES (57, '20260823_225423_author_feature_editable_copy', 30, '2026-08-23 19:10:17.518-04', '2026-08-23 19:10:17.517-04');
INSERT INTO public.payload_migrations VALUES (58, '20260823_235319_expand_single_type_listicle_angle_values', 31, '2026-08-23 19:53:44.465-04', '2026-08-23 19:53:44.464-04');
INSERT INTO public.payload_migrations VALUES (59, '20260920_120000_public_feed_indexes', 32, '2026-09-20 21:10:03.593-04', '2026-09-20 21:10:03.592-04');
INSERT INTO public.payload_migrations VALUES (60, '20260920_140000_public_search_documents', 33, '2026-09-20 21:39:29.351-04', '2026-09-20 21:39:29.35-04');
INSERT INTO public.payload_migrations VALUES (61, '20260921_214514_refresh_jobs_outbox', 34, '2026-09-21 17:46:02.924-04', '2026-09-21 17:46:02.923-04');
INSERT INTO public.payload_migrations VALUES (62, '20260922_063804_refresh_jobs_fencing', 35, '2026-09-22 18:47:43.126-04', '2026-09-22 18:47:43.126-04');
SELECT pg_catalog.setval('public.payload_migrations_id_seq', 62, true);
