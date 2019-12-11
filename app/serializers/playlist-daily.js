import ApplicationSerializer from './application';
import transformAttributes from '../utils/transform-attributes';
import generateTrackUniqueId from '../utils/generate-track-unique-id';
import moment from 'moment';
import { get } from '@ember/object';

// Attributes on the left are how they appear on in the model,
// On the right is a getter string to retreive from the incoming payload,
// Or a function to run the payload through. Ember Data technically has a
// way to do this with defining serializers for each model, but this is
// so non-standard already and much clearer.

const trackAttributeTransform = {
  startTime      : 'iso_start_time',
  trackTitle     : 'info.title',
  composerName   : 'info.composer.name',
  conductorName  : 'info.conductor.name',
  ensembleName   : 'info.ensemble.name',
  catno          : 'info.catno',
  trackLength    : 'length',
  catalogEntry   : 'info'
}

const airingAttributeTransform = {
  startTime    : 'iso_start_timestamp',
  endTime      : 'iso_end_timestamp',
  showSlug     : (e) => e.event_url.split('/').pop(),
  showId       : 'show_id',
  showTitle    : 'show_title'
}

export default ApplicationSerializer.extend({
  normalizeFindRecordResponse(store, modelClass, payload, id, requestType) {
    payload.playlistDaily.events.sort(function(a, b) {
      return (moment(get(a, 'iso_start_timestamp'), 'YYYY-MM-DDTHH:mm:ss') > moment(get(b, 'iso_start_timestamp'), 'YYYY-MM-DDTHH:mm:ss') ? -1 : 1);
    });

    payload.playlistDaily.events.forEach(function(event) {
      if (event.playlists) {
        var playlist = [];

        for (var i = 0, l = event.playlists.length; i < l; i++) {
          playlist = playlist.concat(event.playlists[i].played);
        }

        event.playlist = playlist;
        delete event.playlists;
      }
    });

    let included = [];

    let airings = payload.playlistDaily.events.map(event => {
      let airing = {
        id: event.id,
        type: 'airing',
        attributes: transformAttributes(event, airingAttributeTransform)
      };

      if (event.playlist && event.playlist.length > 0) {
        let tracks = event.playlist.map(track => {
          let trackAttrs = transformAttributes(track, trackAttributeTransform);
          return {
            id: generateTrackUniqueId(trackAttrs),
            type: 'track',
            attributes: trackAttrs,
            relationships: {
              airing: {
                data: {
                  id: airing.id,
                  type: airing.type
                }
              }
            }
          }
        })

        if (tracks.length > 0) {
          airing.relationships = {
            tracks: {
              data: tracks.map(t => ({ id: t.id, type: t.type }))
            }
          }
          tracks.forEach(t => included.push(t));
        }
      }

      return airing
    })

    airings.forEach(a => included.push(a));


    let normalizedPayload = {
      data: {
        type: 'playlist_daily',
        id,
        relationships: {
          airings: {
            data: airings.map(a => ({ id: a.id, type: a.type }))
          }
        }
      },
      included: included
    }

    return this._super(store, modelClass, normalizedPayload, id, requestType);
  },
});
