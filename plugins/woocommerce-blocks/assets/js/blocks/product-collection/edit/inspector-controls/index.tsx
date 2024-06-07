/**
 * External dependencies
 */
import type { BlockEditProps } from '@wordpress/blocks';
import { InspectorControls } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';
import { type ElementType, useMemo } from '@wordpress/element';
import { EditorBlock, isEmpty } from '@woocommerce/types';
import { addFilter } from '@wordpress/hooks';
import { ProductCollectionFeedbackPrompt } from '@woocommerce/editor-components/feedback-prompt';
import {
	enableAutoUpdate,
	revertMigration,
	getUpgradeStatus,
	HOURS_TO_DISPLAY_UPGRADE_NOTICE,
	UPGRADE_NOTICE_DISPLAY_COUNT_THRESHOLD,
} from '@woocommerce/blocks/migration-products-to-product-collection';
import { recordEvent } from '@woocommerce/tracks';
import {
	// @ts-expect-error Using experimental features
	// eslint-disable-next-line @wordpress/no-unsafe-wp-apis
	__experimentalToolsPanel as ToolsPanel,
} from '@wordpress/components';

/**
 * Internal dependencies
 */
import metadata from '../../block.json';
import { useTracksLocation } from '../../tracks-utils';
import {
	ProductCollectionEditComponentProps,
	ProductCollectionAttributes,
	CoreFilterNames,
	FilterName,
} from '../../types';
import { setQueryAttribute } from '../../utils';
import { getDefaultSettings } from '../../constants';
import UpgradeNotice from './upgrade-notice';
import ColumnsControl from './columns-control';
import InheritQueryControl from './inherit-query-control';
import OrderByControl from './order-by-control';
import OnSaleControl from './on-sale-control';
import StockStatusControl from './stock-status-control';
import KeywordControl from './keyword-control';
import AttributesControl from './attributes-control';
import TaxonomyControls from './taxonomy-controls';
import HandPickedProductsControl from './hand-picked-products-control';
import LayoutOptionsControl from './layout-options-control';
import FeaturedProductsControl from './featured-products-control';
import CreatedControl from './created-control';
import PriceRangeControl from './price-range-control';

const prepareShouldShowFilter =
	( hideControls: FilterName[] ) => ( filter: FilterName ) => {
		return ! hideControls.includes( filter );
	};

const ProductCollectionInspectorControls = (
	props: ProductCollectionEditComponentProps
) => {
	const { attributes, context, setAttributes } = props;
	const { query, collection, hideControls, displayLayout } = attributes;

	const tracksLocation = useTracksLocation( context.templateSlug );
	const trackInteraction = ( filter: FilterName ) =>
		recordEvent( 'blocks_product_collection_inspector_control_clicked', {
			collection: attributes.collection,
			location: tracksLocation,
			filter,
		} );

	const inherit = query?.inherit;
	const shouldShowFilter = prepareShouldShowFilter( hideControls );

	const showQueryControls = inherit === false;
	const showInheritQueryControls =
		isEmpty( collection ) || shouldShowFilter( CoreFilterNames.INHERIT );
	const showOrderControl =
		showQueryControls && shouldShowFilter( CoreFilterNames.ORDER );
	const showFeaturedControl = shouldShowFilter( CoreFilterNames.FEATURED );
	const showOnSaleControl = shouldShowFilter( CoreFilterNames.ON_SALE );

	const setQueryAttributeBind = useMemo(
		() => setQueryAttribute.bind( null, props ),
		[ props ]
	);

	const displayControlProps = {
		setAttributes,
		displayLayout,
	};

	const queryControlProps = {
		setQueryAttribute: setQueryAttributeBind,
		trackInteraction,
		query,
	};

	return (
		<InspectorControls>
			<ToolsPanel
				label={ __( 'Settings', 'woocommerce' ) }
				resetAll={ () => {
					const defaultSettings = getDefaultSettings(
						props.attributes
					);
					props.setAttributes( defaultSettings );
				} }
			>
				{ showInheritQueryControls && (
					<InheritQueryControl { ...queryControlProps } />
				) }
				<LayoutOptionsControl { ...displayControlProps } />
				<ColumnsControl { ...displayControlProps } />
				{ showOrderControl && (
					<OrderByControl { ...queryControlProps } />
				) }
			</ToolsPanel>

			{ showQueryControls ? (
				<ToolsPanel
					label={ __( 'Filters', 'woocommerce' ) }
					resetAll={ ( resetAllFilters: ( () => void )[] ) => {
						resetAllFilters.forEach( ( resetFilter ) => {
							resetFilter();
						} );
					} }
					className="wc-block-editor-product-collection-inspector-toolspanel__filters"
				>
					{ showOnSaleControl && (
						<OnSaleControl { ...queryControlProps } />
					) }
					<StockStatusControl { ...queryControlProps } />
					<HandPickedProductsControl { ...queryControlProps } />
					<KeywordControl { ...queryControlProps } />
					<AttributesControl { ...queryControlProps } />
					<TaxonomyControls { ...queryControlProps } />
					{ showFeaturedControl && (
						<FeaturedProductsControl { ...queryControlProps } />
					) }
					<CreatedControl { ...queryControlProps } />
					<PriceRangeControl { ...queryControlProps } />
				</ToolsPanel>
			) : null }
			<ProductCollectionFeedbackPrompt />
		</InspectorControls>
	);
};

export default ProductCollectionInspectorControls;

// Trigger Auto Upgrade of Products only once when module is loaded.
// This triggers subscription but only if:
// - auto update is enabled
// - user haven't reverted the migration
// - no other subscription is in place
enableAutoUpdate();

const isProductCollection = ( blockName: string ) =>
	blockName === metadata.name;

const lessThanThresholdSinceUpdate = ( t: number ) => {
	// Xh * 60m * 60s * 1000ms
	const xHoursFromT = t + HOURS_TO_DISPLAY_UPGRADE_NOTICE * 60 * 60 * 1000;
	return Date.now() < xHoursFromT;
};

const displayedLessThanThreshold = ( displayCount = 0 ) => {
	return displayCount <= UPGRADE_NOTICE_DISPLAY_COUNT_THRESHOLD;
};

// Upgrade Notice should be displayed only if:
// - block is converted from Products
// - user haven't acknowledged seeing the notice
// - less than X hours since the notice was first displayed
// - notice was displayed less than X times
const shouldDisplayUpgradeNotice = ( props ) => {
	const { attributes } = props;
	const { convertedFromProducts } = attributes;
	const { status, time, displayCount } = getUpgradeStatus();

	return (
		convertedFromProducts &&
		status === 'notseen' &&
		lessThanThresholdSinceUpdate( time ) &&
		displayedLessThanThreshold( displayCount )
	);
};

// Block should be unmarked as converted from Products if:
// block is converted from Products and either:
// - user acknowledged seeing the notice
// - it's more than X hours since the notice was first displayed
// - notice was displayed more than X times
// We do that to prevent showing the notice again after Products on
// other page were updated or local storage was cleared or user
// switched to another machine/browser etc.
const shouldBeUnmarkedAsConverted = ( props ) => {
	const { attributes } = props;
	const { convertedFromProducts } = attributes;
	const { status, time, displayCount } = getUpgradeStatus();

	return (
		convertedFromProducts &&
		( status === 'seen' ||
			! lessThanThresholdSinceUpdate( time ) ||
			! displayedLessThanThreshold( displayCount ) )
	);
};

export const withUpgradeNoticeControls =
	< T extends EditorBlock< T > >( BlockEdit: ElementType ) =>
	( props: BlockEditProps< ProductCollectionAttributes > ) => {
		if ( ! isProductCollection( props.name ) ) {
			return <BlockEdit { ...props } />;
		}

		const displayUpgradeNotice = shouldDisplayUpgradeNotice( props );
		const unmarkAsConverted = shouldBeUnmarkedAsConverted( props );

		if ( unmarkAsConverted ) {
			props.setAttributes( { convertedFromProducts: false } );
		}

		return (
			<>
				{ displayUpgradeNotice && (
					<InspectorControls>
						{
							<UpgradeNotice
								revertMigration={ revertMigration }
							/>
						}
					</InspectorControls>
				) }
				<BlockEdit { ...props } />
			</>
		);
	};

addFilter( 'editor.BlockEdit', metadata.name, withUpgradeNoticeControls );
